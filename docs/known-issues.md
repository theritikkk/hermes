# Known Issues

## admin-service: Mockito + Java 26 test failures (Phase 2+)

**Affected tests:** `TenantServiceTest`, `WorkflowDefinitionServiceTest`  
**Root cause:** Mockito's inline mock maker cannot mock Spring Data repository interfaces (`TenantRepository`, `WorkflowDefinitionRepository`) on Java 26. The JVM reports `Could not modify all classes` when attempting to create mocks of these interfaces.  
**Impact:** 4 test errors. Compilation and all other tests (including `VersioningTest`) are unaffected.  
**Remediation:** Upgrade to a Mockito version that supports Java 26, or switch these tests to use `@MockBean` with a Spring test context, or use manual test doubles.  
**Priority:** Low  `admin-service` is Phase 2+ scope per `docs/adr/022-ecs-fargate-for-java-apis.md`.

## admin-service: Lombok `sun.misc.Unsafe` deprecation warning

**Symptom:** `WARNING: sun.misc.Unsafe::objectFieldOffset has been called by lombok.permit.Permit`  
**Root cause:** Lombok 1.18.40 still uses `sun.misc.Unsafe` internally, which is terminally deprecated in Java 25+.  
**Impact:** Warning only  compilation succeeds. Will become a hard error in a future JDK release.  
**Remediation:** Upgrade Lombok when a version that avoids `Unsafe` is released.
