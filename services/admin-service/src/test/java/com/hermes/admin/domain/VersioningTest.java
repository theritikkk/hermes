package com.hermes.admin.domain;

import com.hermes.command.infrastructure.eventstore.EventSchemaUpcaster;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;

/**
 * Comprehensive test suite for Workflow & Event Versioning.
 *
 * <p>Tests cover:
 * <ul>
 *   <li>WorkflowVersionRegistry: register draft, publish, deprecate, list, resolve</li>
 *   <li>Version pinning: executions use creation-time version</li>
 *   <li>Registry invariants: duplicate registration, invalid versions, DRAFT guard</li>
 *   <li>EventSchemaUpcaster: individual upcaster transforms</li>
 *   <li>Chain upcasting: v1 → v3 via intermediate v2</li>
 *   <li>Idempotency: already-current-version events pass through unchanged</li>
 *   <li>Custom upcaster registration</li>
 * </ul>
 */
class VersioningTest {

    // ── WorkflowVersionRegistry ────────────────────────────────────────────

    @Nested
    @DisplayName("WorkflowVersionRegistry")
    class VersionRegistryTests {

        private WorkflowVersionRegistry registry;
        private static final String PIPELINE = "document-pipeline";
        private static final String ASL_V1 = "{\"StartAt\":\"validate\",\"States\":{}}";
        private static final String ASL_V2 = "{\"StartAt\":\"validate\",\"States\":{\"v2\":true}}";

        @BeforeEach
        void setUp() {
            registry = new WorkflowVersionRegistry();
        }

        @Test
        @DisplayName("registerDraft creates entry in DRAFT status")
        void testRegisterDraft_createsDraftEntry() {
            var wf = registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            assertThat(wf.status()).isEqualTo(WorkflowVersionRegistry.VersionedWorkflow.Status.DRAFT);
            assertThat(wf.name()).isEqualTo(PIPELINE);
            assertThat(wf.version()).isEqualTo(1);
            assertThat(wf.registeredBy()).isEqualTo("alice");
            assertThat(wf.registeredAt()).isNotNull();
        }

        @Test
        @DisplayName("publish transitions DRAFT → ACTIVE")
        void testPublish_transitionsDraftToActive() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            var published = registry.publish(PIPELINE, 1);
            assertThat(published.status()).isEqualTo(WorkflowVersionRegistry.VersionedWorkflow.Status.ACTIVE);
            assertThat(published.isActive()).isTrue();
        }

        @Test
        @DisplayName("publishing v2 automatically deprecates v1")
        void testPublish_deprecatesPreviousActiveVersion() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);

            registry.registerDraft(PIPELINE, 2, ASL_V2, "bob");
            registry.publish(PIPELINE, 2);

            var v1 = registry.getExact(PIPELINE, 1);
            var v2 = registry.getExact(PIPELINE, 2);

            assertThat(v1.status()).isEqualTo(WorkflowVersionRegistry.VersionedWorkflow.Status.DEPRECATED);
            assertThat(v2.status()).isEqualTo(WorkflowVersionRegistry.VersionedWorkflow.Status.ACTIVE);
        }

        @Test
        @DisplayName("getLatestActive returns the currently published version")
        void testGetLatestActive_returnsActiveVersion() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            registry.registerDraft(PIPELINE, 2, ASL_V2, "bob");
            registry.publish(PIPELINE, 2);

            var latest = registry.getLatestActive(PIPELINE);
            assertThat(latest.version()).isEqualTo(2);
        }

        @Test
        @DisplayName("getLatestActive throws when no active version exists")
        void testGetLatestActive_noActive_throws() {
            assertThatThrownBy(() -> registry.getLatestActive("unknown-workflow"))
                    .isInstanceOf(NoSuchElementException.class)
                    .hasMessageContaining("No active version");
        }

        @Test
        @DisplayName("getExact retrieves deprecated versions (version pinning)")
        void testGetExact_retrievesDeprecatedVersion_versionPinning() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            registry.registerDraft(PIPELINE, 2, ASL_V2, "bob");
            registry.publish(PIPELINE, 2);

            // Version 1 is deprecated but still accessible for in-flight executions
            var v1 = registry.getExact(PIPELINE, 1);
            assertThat(v1.version()).isEqualTo(1);
            assertThat(v1.aslDefinition()).isEqualTo(ASL_V1);
        }

        @Test
        @DisplayName("getExact throws for non-existent (name, version)")
        void testGetExact_notFound_throws() {
            assertThatThrownBy(() -> registry.getExact(PIPELINE, 99))
                    .isInstanceOf(NoSuchElementException.class);
        }

        @Test
        @DisplayName("duplicate registration throws IllegalArgumentException")
        void testRegisterDraft_duplicateVersion_throws() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            assertThatThrownBy(() -> registry.registerDraft(PIPELINE, 1, ASL_V1, "bob"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("already registered");
        }

        @Test
        @DisplayName("version < 1 throws IllegalArgumentException")
        void testRegisterDraft_invalidVersion_throws() {
            assertThatThrownBy(() -> registry.registerDraft(PIPELINE, 0, ASL_V1, "alice"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("must be >= 1");
        }

        @Test
        @DisplayName("cannot publish a non-DRAFT version")
        void testPublish_nonDraftVersion_throws() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            assertThatThrownBy(() -> registry.publish(PIPELINE, 1))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("ACTIVE");
        }

        @Test
        @DisplayName("resolveForExecution returns latest active when no version specified")
        void testResolveForExecution_noVersionPin_returnsLatest() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);

            var resolved = registry.resolveForExecution(PIPELINE, null);
            assertThat(resolved.version()).isEqualTo(1);
            assertThat(resolved.isActive()).isTrue();
        }

        @Test
        @DisplayName("resolveForExecution with pinned version returns that exact version")
        void testResolveForExecution_pinnedVersion_returnsExact() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            registry.registerDraft(PIPELINE, 2, ASL_V2, "bob");
            registry.publish(PIPELINE, 2);

            // An execution that started on v1 should remain on v1
            var resolved = registry.resolveForExecution(PIPELINE, 1);
            assertThat(resolved.version()).isEqualTo(1);
        }

        @Test
        @DisplayName("resolveForExecution blocks DRAFT versions from execution")
        void testResolveForExecution_draftVersion_throws() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            // Not published yet

            assertThatThrownBy(() -> registry.resolveForExecution(PIPELINE, 1))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("DRAFT");
        }

        @Test
        @DisplayName("listVersions returns all versions in ascending order")
        void testListVersions_returnsAscendingOrder() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            registry.registerDraft(PIPELINE, 2, ASL_V2, "bob");
            registry.publish(PIPELINE, 2);
            registry.registerDraft(PIPELINE, 3, "{}", "carol");

            List<WorkflowVersionRegistry.VersionedWorkflow> versions = registry.listVersions(PIPELINE);
            assertThat(versions).hasSize(3);
            assertThat(versions.get(0).version()).isEqualTo(1);
            assertThat(versions.get(1).version()).isEqualTo(2);
            assertThat(versions.get(2).version()).isEqualTo(3);
        }

        @Test
        @DisplayName("deprecate() is idempotent — calling twice is safe")
        void testDeprecate_idempotent() {
            registry.registerDraft(PIPELINE, 1, ASL_V1, "alice");
            registry.publish(PIPELINE, 1);
            registry.deprecate(PIPELINE, 1);
            assertThatCode(() -> registry.deprecate(PIPELINE, 1)).doesNotThrowAnyException();
            assertThat(registry.getExact(PIPELINE, 1).isDeprecated()).isTrue();
        }
    }

    // ── EventSchemaUpcaster ────────────────────────────────────────────────

    @Nested
    @DisplayName("EventSchemaUpcaster")
    class UpcasterTests {

        private EventSchemaUpcaster upcaster;

        @BeforeEach
        void setUp() {
            upcaster = new EventSchemaUpcaster();
        }

        @Test
        @DisplayName("v1 WorkflowExecutionStarted gets priority=NORMAL added")
        void testUpcast_workflowExecutionStarted_v1_addsPriority() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("executionId", "exec-1");
            payload.put("workflowName", "document-pipeline");
            payload.put("workflowVersion", 1);

            // Upcast from v1 to current (v3)
            var result = upcaster.upcast("WorkflowExecutionStarted", 1, payload);

            assertThat(result.wasUpcasted()).isTrue();
            assertThat(result.payload()).containsKey("priority");
            assertThat(result.payload().get("priority")).isEqualTo("NORMAL");
        }

        @Test
        @DisplayName("v1 WorkflowExecutionStarted chain: v1 → v2 → v3 adds both fields")
        void testUpcast_workflowExecutionStarted_v1_chainProducesBothFields() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("executionId", "exec-1");
            payload.put("correlationId", "trace-abc-123");

            var result = upcaster.upcast("WorkflowExecutionStarted", 1, payload);

            assertThat(result.version()).isEqualTo(upcaster.getCurrentVersion("WorkflowExecutionStarted"));
            // v1→v2: priority added
            assertThat(result.payload()).containsKey("priority");
            // v2→v3: correlationGroupId derived from correlationId prefix
            assertThat(result.payload()).containsKey("correlationGroupId");
            assertThat(result.payload().get("correlationGroupId")).isEqualTo("trace");
        }

        @Test
        @DisplayName("v2 WorkflowExecutionStarted only runs v2→v3 upcaster")
        void testUpcast_workflowExecutionStarted_v2_onlyRunsV2toV3() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("priority", "HIGH");   // already has priority
            payload.put("correlationId", "grp-xyz");

            var result = upcaster.upcast("WorkflowExecutionStarted", 2, payload);

            assertThat(result.wasUpcasted()).isTrue();
            // priority was NOT overwritten by v1→v2 upcaster (putIfAbsent)
            assertThat(result.payload().get("priority")).isEqualTo("HIGH");
            assertThat(result.payload()).containsKey("correlationGroupId");
        }

        @Test
        @DisplayName("current version event passes through unchanged (no upcast needed)")
        void testUpcast_currentVersion_noUpcast() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("executionId", "exec-1");
            payload.put("priority", "HIGH");
            payload.put("correlationGroupId", "grp-1");

            int currentVersion = upcaster.getCurrentVersion("WorkflowExecutionStarted");
            var result = upcaster.upcast("WorkflowExecutionStarted", currentVersion, payload);

            assertThat(result.wasUpcasted()).isFalse();
            assertThat(result.payload()).isEqualTo(payload);
        }

        @Test
        @DisplayName("StepCompleted v1 → v2 wraps output in result envelope")
        void testUpcast_stepCompleted_v1_wrapsOutputInResult() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("stepName", "ocr");
            payload.put("output", Map.of("text", "Invoice #001"));

            var result = upcaster.upcast("StepCompleted", 1, payload);

            assertThat(result.wasUpcasted()).isTrue();
            assertThat(result.payload()).doesNotContainKey("output");
            assertThat(result.payload()).containsKey("result");

            @SuppressWarnings("unchecked")
            Map<String, Object> resultEnvelope = (Map<String, Object>) result.payload().get("result");
            assertThat(resultEnvelope).containsKey("output");
            assertThat(resultEnvelope).containsKey("metadata");
        }

        @Test
        @DisplayName("StepFailed v1 → v2 adds retryAttempts=0 and errorCode=UNKNOWN")
        void testUpcast_stepFailed_v1_addsRetryAttempts() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("stepName", "ocr");
            payload.put("error", "Timeout after 120s");
            payload.put("retryable", true);

            var result = upcaster.upcast("StepFailed", 1, payload);

            assertThat(result.wasUpcasted()).isTrue();
            assertThat(result.payload().get("retryAttempts")).isEqualTo(0);
            assertThat(result.payload().get("errorCode")).isEqualTo("UNKNOWN");
        }

        @Test
        @DisplayName("unknown event type passes through unchanged")
        void testUpcast_unknownEventType_passthroughUnchanged() {
            Map<String, Object> payload = Map.of("foo", "bar");
            var result = upcaster.upcast("SomeNewEventTypeWeNeverHeardOf", 1, payload);

            assertThat(result.wasUpcasted()).isFalse();
            assertThat(result.payload()).isEqualTo(payload);
        }

        @Test
        @DisplayName("custom upcaster can be registered at runtime")
        void testRegisterCustomUpcaster() {
            upcaster.register(new EventSchemaUpcaster.UpcasterEntry(
                    "MyCustomEvent", 1, 2,
                    p -> {
                        var upgraded = new LinkedHashMap<>(p);
                        upgraded.put("schemaVersion", "v2");
                        return upgraded;
                    }
            ));

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("field1", "value1");

            var result = upcaster.upcast("MyCustomEvent", 1, payload);

            assertThat(result.wasUpcasted()).isTrue();
            assertThat(result.payload().get("schemaVersion")).isEqualTo("v2");
        }

        @Test
        @DisplayName("UpcasterEntry rejects non-sequential version jump")
        void testUpcasterEntry_nonSequentialVersion_throws() {
            assertThatThrownBy(() -> new EventSchemaUpcaster.UpcasterEntry(
                    "SomeEvent", 1, 3, p -> p  // version 1 → 3 is illegal
            )).isInstanceOf(IllegalArgumentException.class)
              .hasMessageContaining("increment version by exactly 1");
        }

        @Test
        @DisplayName("getCurrentVersion returns 1 for unregistered event types")
        void testGetCurrentVersion_unregisteredType_returnsOne() {
            assertThat(upcaster.getCurrentVersion("NonExistentEvent")).isEqualTo(1);
        }
    }
}
