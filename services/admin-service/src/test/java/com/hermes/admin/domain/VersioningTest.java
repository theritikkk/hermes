package com.hermes.admin.domain;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;

/**
 * Test suite for Workflow Versioning.
 *
 * <p>Tests cover:
 * <ul>
 *   <li>WorkflowVersionRegistry: register draft, publish, deprecate, list, resolve</li>
 *   <li>Version pinning: executions use creation-time version</li>
 *   <li>Registry invariants: duplicate registration, invalid versions, DRAFT guard</li>
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
}
