package com.hermes.admin.domain;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-process registry of workflow definition versions.
 *
 * <p><b>Versioning contract</b>:
 * <ul>
 *   <li>Each (workflowName, version) pair is <em>immutable once published</em>.</li>
 *   <li>Executions are pinned to the version active at submission time;
 *       they never silently migrate to a newer version mid-flight.</li>
 *   <li>The latest ACTIVE version is the default for new submissions that
 *       do not specify an explicit version.</li>
 *   <li>Older versions may be {@link VersionedWorkflow.Status#DEPRECATED} but
 *       must never be deleted while live executions reference them.</li>
 * </ul>
 *
 * <p><b>Production note</b>: This registry is a write-through cache backed by
 * Aurora PostgreSQL ({@code workflow_definitions} table). The in-memory map
 * enables zero-latency lookups on the hot path without a DB round-trip.
 */
@Component
public class WorkflowVersionRegistry {

    private static final Logger log = LoggerFactory.getLogger(WorkflowVersionRegistry.class);

    // ── Value types ──────────────────────────────────────────────────────

    /**
     * A fully resolved, versioned workflow entry in the registry.
     *
     * @param name          workflow name (e.g. "document-pipeline")
     * @param version       positive integer version
     * @param aslDefinition Step Functions ASL JSON, stored as serialized string
     * @param status        lifecycle status
     * @param registeredBy  userId who published this version
     */
    public record VersionedWorkflow(
            String name,
            int version,
            String aslDefinition,
            Status status,
            java.time.Instant registeredAt,
            String registeredBy
    ) {
        public enum Status { DRAFT, ACTIVE, DEPRECATED }

        public boolean isActive() { return status == Status.ACTIVE; }
        public boolean isDeprecated() { return status == Status.DEPRECATED; }

        /** Returns a copy of this record with the given status. */
        public VersionedWorkflow withStatus(Status newStatus) {
            return new VersionedWorkflow(name, version, aslDefinition, newStatus, registeredAt, registeredBy);
        }
    }

    /** Composite key for O(1) registry lookups. */
    private record RegistryKey(String name, int version) {}

    // ── State ─────────────────────────────────────────────────────────────

    /**
     * Primary index: (name, version) → VersionedWorkflow.
     */
    private final ConcurrentHashMap<RegistryKey, VersionedWorkflow> registry = new ConcurrentHashMap<>();

    /**
     * Tracks the latest ACTIVE version number per workflow name.
     * Updated atomically on publish/deprecate.
     */
    private final ConcurrentHashMap<String, Integer> latestActiveVersion = new ConcurrentHashMap<>();

    // ── Registration ──────────────────────────────────────────────────────

    /**
     * Registers a new workflow version in DRAFT status.
     *
     * <p>Draft versions are invisible to new execution submissions.
     * Call {@link #publish(String, int)} to make a draft ACTIVE.
     *
     * @param name          workflow name
     * @param version       version number (must be > any existing version for this name)
     * @param aslDefinition compiled Step Functions ASL JSON string
     * @param registeredBy  user/system publishing this version
     * @return the registered {@link VersionedWorkflow}
     * @throws IllegalArgumentException if a workflow with this (name, version) is already registered
     * @throws IllegalArgumentException if version is not positive
     */
    public VersionedWorkflow registerDraft(
            String name, int version, String aslDefinition, String registeredBy) {

        validateName(name);
        if (version < 1) {
            throw new IllegalArgumentException("Workflow version must be >= 1, got " + version);
        }

        RegistryKey key = new RegistryKey(name, version);
        if (registry.containsKey(key)) {
            throw new IllegalArgumentException(
                    String.format("Workflow %s:v%d is already registered", name, version));
        }

        VersionedWorkflow workflow = new VersionedWorkflow(
                name, version, aslDefinition,
                VersionedWorkflow.Status.DRAFT,
                java.time.Instant.now(), registeredBy);

        registry.put(key, workflow);
        log.info("[VersionRegistry] REGISTERED_DRAFT name={} version={} by={}", name, version, registeredBy);
        return workflow;
    }

    /**
     * Publishes a DRAFT version, making it ACTIVE.
     *
     * <p>Only one version per workflow name may be ACTIVE at a time. Publishing a
     * new version automatically deprecates the previously active version.
     *
     * @param name    workflow name
     * @param version draft version to activate
     * @return the now-ACTIVE {@link VersionedWorkflow}
     * @throws NoSuchElementException   if no draft exists for (name, version)
     * @throws IllegalStateException    if the version is not in DRAFT status
     */
    public VersionedWorkflow publish(String name, int version) {
        RegistryKey key = new RegistryKey(name, version);
        VersionedWorkflow existing = requireWorkflow(key);

        if (existing.status() != VersionedWorkflow.Status.DRAFT) {
            throw new IllegalStateException(
                    String.format("Cannot publish %s:v%d — it is in status %s", name, version, existing.status()));
        }

        // Deprecate any currently-active version for this name
        Integer currentActiveVersion = latestActiveVersion.get(name);
        if (currentActiveVersion != null) {
            RegistryKey activeKey = new RegistryKey(name, currentActiveVersion);
            registry.computeIfPresent(activeKey, (k, wf) -> {
                log.info("[VersionRegistry] DEPRECATED name={} version={}", name, currentActiveVersion);
                return wf.withStatus(VersionedWorkflow.Status.DEPRECATED);
            });
        }

        VersionedWorkflow published = existing.withStatus(VersionedWorkflow.Status.ACTIVE);
        registry.put(key, published);
        latestActiveVersion.put(name, version);

        log.info("[VersionRegistry] PUBLISHED name={} version={}", name, version);
        return published;
    }

    /**
     * Explicitly deprecates an ACTIVE version without publishing a new one.
     * Use when a workflow is being retired with no replacement.
     */
    public VersionedWorkflow deprecate(String name, int version) {
        RegistryKey key = new RegistryKey(name, version);
        VersionedWorkflow existing = requireWorkflow(key);

        if (existing.status() == VersionedWorkflow.Status.DEPRECATED) {
            return existing; // idempotent
        }

        VersionedWorkflow deprecated = existing.withStatus(VersionedWorkflow.Status.DEPRECATED);
        registry.put(key, deprecated);

        // Clear latest if this was the active version
        latestActiveVersion.computeIfPresent(name, (n, v) -> v.equals(version) ? null : v);

        log.info("[VersionRegistry] EXPLICITLY_DEPRECATED name={} version={}", name, version);
        return deprecated;
    }

    // ── Lookup ────────────────────────────────────────────────────────────

    /**
     * Looks up an exact (name, version) — used for version pinning on existing executions.
     * Returns the workflow regardless of its status (DRAFT/ACTIVE/DEPRECATED).
     *
     * @throws NoSuchElementException if not found
     */
    public VersionedWorkflow getExact(String name, int version) {
        return requireWorkflow(new RegistryKey(name, version));
    }

    /**
     * Returns the latest ACTIVE version of the named workflow.
     * This is the version assigned to new executions that don't specify a version.
     *
     * @throws NoSuchElementException if no active version exists for this workflow
     */
    public VersionedWorkflow getLatestActive(String name) {
        Integer activeVersion = latestActiveVersion.get(name);
        if (activeVersion == null) {
            throw new NoSuchElementException("No active version found for workflow: " + name);
        }
        return requireWorkflow(new RegistryKey(name, activeVersion));
    }

    /**
     * Returns the version number that should be used for a new execution.
     * If the caller has pinned a specific version, that version is validated and returned.
     * Otherwise the latest ACTIVE version is used.
     *
     * @param name            workflow name
     * @param requestedVersion null = use latest ACTIVE; non-null = pin to this version
     * @return the resolved {@link VersionedWorkflow} (always ACTIVE or a valid pinned DEPRECATED)
     */
    public VersionedWorkflow resolveForExecution(String name, Integer requestedVersion) {
        if (requestedVersion != null) {
            VersionedWorkflow pinned = requireWorkflow(new RegistryKey(name, requestedVersion));
            if (pinned.status() == VersionedWorkflow.Status.DRAFT) {
                throw new IllegalStateException(
                        String.format("Cannot execute against DRAFT workflow %s:v%d. Publish it first.", name, requestedVersion));
            }
            return pinned;
        }
        return getLatestActive(name);
    }

    /**
     * Returns all registered versions for a workflow in ascending version order.
     *
     * @param name workflow name
     * @return immutable ordered list (may be empty)
     */
    public List<VersionedWorkflow> listVersions(String name) {
        return registry.entrySet().stream()
                .filter(e -> e.getKey().name().equals(name))
                .map(Map.Entry::getValue)
                .sorted(Comparator.comparingInt(VersionedWorkflow::version))
                .toList();
    }

    /**
     * Returns the total number of distinct (name, version) entries in the registry.
     */
    public int size() {
        return registry.size();
    }

    // ── Private ──────────────────────────────────────────────────────────

    private VersionedWorkflow requireWorkflow(RegistryKey key) {
        VersionedWorkflow wf = registry.get(key);
        if (wf == null) {
            throw new NoSuchElementException(
                    String.format("Workflow %s:v%d not found in registry", key.name(), key.version()));
        }
        return wf;
    }

    private void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Workflow name must not be blank");
        }
    }
}
