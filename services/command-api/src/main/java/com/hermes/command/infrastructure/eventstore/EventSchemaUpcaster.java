package com.hermes.command.infrastructure.eventstore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.function.UnaryOperator;

/**
 * Event schema upcaster — backwards-compatible event payload migration.
 *
 * <p>As the Hermes event schema evolves, old events stored in DynamoDB may
 * have payloads that do not conform to the current schema version. Rather than
 * performing a lossy migration of stored data, the upcaster applies a chain
 * of lightweight transformation functions at <em>read time</em>, converting
 * v1 payloads to v2, v2 to v3, etc., transparently.
 *
 * <p><b>Design rationale</b> (Axon / Greg Young pattern):
 * <ul>
 *   <li>Upcasters are registered per (eventType, fromVersion → toVersion).</li>
 *   <li>At read time, the event's {@code eventVersion} field is compared to
 *       the current schema version. If lower, the registered upcaster chain is
 *       applied in order.</li>
 *   <li>Upcasters receive and return a {@code Map<String, Object>} payload,
 *       keeping them decoupled from serialization format.</li>
 *   <li>Upcasters must be pure functions with no side effects.</li>
 * </ul>
 *
 * <p><b>Registered upcasters</b> (initial set — extend as schema evolves):
 * <ul>
 *   <li>{@code WorkflowExecutionStarted} v1 → v2: adds {@code priority} field (default "NORMAL")</li>
 *   <li>{@code StepCompleted} v1 → v2: wraps {@code output} in a {@code result} envelope</li>
 *   <li>{@code StepFailed} v1 → v2: adds {@code retryAttempts} field (default 0)</li>
 * </ul>
 */
@Component
public class EventSchemaUpcaster {

    private static final Logger log = LoggerFactory.getLogger(EventSchemaUpcaster.class);

    /**
     * A single schema migration step.
     *
     * @param eventType   the event type this upcaster applies to
     * @param fromVersion the schema version this upcaster reads
     * @param toVersion   the schema version this upcaster produces (must equal fromVersion + 1)
     * @param transform   pure function transforming the payload map
     */
    public record UpcasterEntry(
            String eventType,
            int fromVersion,
            int toVersion,
            UnaryOperator<Map<String, Object>> transform
    ) {
        UpcasterEntry {
            if (toVersion != fromVersion + 1) {
                throw new IllegalArgumentException(
                        "Upcaster must increment version by exactly 1: " + fromVersion + " → " + toVersion);
            }
        }
    }

    /** Result of an upcast operation — includes the migrated payload and the new version. */
    public record UpcastResult(
            Map<String, Object> payload,
            int version,
            boolean wasUpcasted
    ) {}

    // ── Registry ──────────────────────────────────────────────────────────

    /**
     * Ordered chain of upcasters, keyed by (eventType, fromVersion).
     * A chain entry at (type, 1) runs before (type, 2), etc.
     */
    private final Map<String, List<UpcasterEntry>> upcasterChains = new LinkedHashMap<>();

    /**
     * The current (target) schema version per event type.
     * Upcasting will run until this version is reached.
     */
    private final Map<String, Integer> currentSchemaVersions = new HashMap<>();

    // ── Constructor — register all built-in upcasters ─────────────────────

    public EventSchemaUpcaster() {
        registerBuiltInUpcasters();
    }

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Attempts to upcast the given event payload from its stored version to
     * the current schema version.
     *
     * <p>If no upcaster is registered for (eventType, storedVersion), the payload
     * is returned unchanged with {@code wasUpcasted=false}.
     *
     * @param eventType     the event type (e.g. "WorkflowExecutionStarted")
     * @param storedVersion the version embedded in the stored event envelope
     * @param payload       the raw payload map from DynamoDB
     * @return the (possibly migrated) payload and resulting schema version
     */
    public UpcastResult upcast(String eventType, int storedVersion, Map<String, Object> payload) {
        Integer target = currentSchemaVersions.get(eventType);
        if (target == null || storedVersion >= target) {
            return new UpcastResult(payload, storedVersion, false);
        }

        List<UpcasterEntry> chain = upcasterChains.getOrDefault(eventType, Collections.emptyList());
        Map<String, Object> current = new LinkedHashMap<>(payload);
        int currentVersion = storedVersion;

        for (UpcasterEntry entry : chain) {
            if (entry.fromVersion() != currentVersion) continue;
            if (entry.fromVersion() >= target) break;

            log.debug("[Upcaster] Applying {} v{} → v{}", eventType, entry.fromVersion(), entry.toVersion());
            current = new LinkedHashMap<>(entry.transform().apply(current));
            currentVersion = entry.toVersion();
        }

        boolean changed = currentVersion != storedVersion;
        return new UpcastResult(Collections.unmodifiableMap(current), currentVersion, changed);
    }

    /**
     * Registers a custom upcaster at runtime.
     * Thread-safe via synchronized block (registry is only mutated at startup).
     *
     * @param entry the upcaster to register
     */
    public synchronized void register(UpcasterEntry entry) {
        upcasterChains
                .computeIfAbsent(entry.eventType(), k -> new ArrayList<>())
                .add(entry);
        // Sort by fromVersion to ensure correct chain ordering
        upcasterChains.get(entry.eventType())
                .sort(Comparator.comparingInt(UpcasterEntry::fromVersion));

        // Track max toVersion as the current schema version
        currentSchemaVersions.merge(entry.eventType(), entry.toVersion(), Math::max);

        log.info("[Upcaster] Registered: {} v{} → v{}", entry.eventType(), entry.fromVersion(), entry.toVersion());
    }

    /** Returns the current schema version for the given event type, or 1 if unknown. */
    public int getCurrentVersion(String eventType) {
        return currentSchemaVersions.getOrDefault(eventType, 1);
    }

    // ── Built-in upcasters ────────────────────────────────────────────────

    private void registerBuiltInUpcasters() {

        // WorkflowExecutionStarted v1 → v2
        // Change: adds 'priority' field (was implicit NORMAL in v1, now explicit)
        register(new UpcasterEntry(
                "WorkflowExecutionStarted", 1, 2,
                payload -> {
                    Map<String, Object> upgraded = new LinkedHashMap<>(payload);
                    upgraded.putIfAbsent("priority", "NORMAL");
                    return upgraded;
                }
        ));

        // WorkflowExecutionStarted v2 → v3
        // Change: adds 'correlationGroupId' field for cross-tenant tracing
        register(new UpcasterEntry(
                "WorkflowExecutionStarted", 2, 3,
                payload -> {
                    Map<String, Object> upgraded = new LinkedHashMap<>(payload);
                    // Derive correlationGroupId from existing correlationId prefix if present
                    String correlationId = (String) payload.getOrDefault("correlationId", "");
                    upgraded.putIfAbsent("correlationGroupId",
                            correlationId.contains("-") ? correlationId.split("-")[0] : correlationId);
                    return upgraded;
                }
        ));

        // StepCompleted v1 → v2
        // Change: output moved from top-level key to nested inside 'result' envelope
        register(new UpcasterEntry(
                "StepCompleted", 1, 2,
                payload -> {
                    Map<String, Object> upgraded = new LinkedHashMap<>(payload);
                    if (payload.containsKey("output") && !payload.containsKey("result")) {
                        Map<String, Object> result = new LinkedHashMap<>();
                        result.put("output", payload.get("output"));
                        result.put("metadata", Collections.emptyMap());
                        upgraded.put("result", result);
                        upgraded.remove("output");
                    }
                    return upgraded;
                }
        ));

        // StepFailed v1 → v2
        // Change: adds 'retryAttempts' counter (was not tracked in v1)
        register(new UpcasterEntry(
                "StepFailed", 1, 2,
                payload -> {
                    Map<String, Object> upgraded = new LinkedHashMap<>(payload);
                    upgraded.putIfAbsent("retryAttempts", 0);
                    upgraded.putIfAbsent("errorCode", "UNKNOWN");
                    return upgraded;
                }
        ));
    }
}
