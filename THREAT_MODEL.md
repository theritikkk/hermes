# Hermes — Security Threat Model (STRIDE)

This document provides a comprehensive security threat model for Hermes evaluated using the Microsoft STRIDE methodology.

---

## Threat Analysis Matrix

| Threat Category | Potential Attack Vector | Impact | Mitigation / Defense Control | Status |
|---|---|---|---|---|
| **Spoofing** | Unauthorized JWT token creation or Webhook HMAC signature forgery | High | API Gateway validates Cognito JWT signatures at edge. Webhook dispatcher signs HTTP payloads with HMAC-SHA256 (`X-Hermes-Signature`). | **Mitigated** |
| **Tampering** | Parameter tampering or cross-tenant aggregate modification | High | Events are appended to immutable DynamoDB Event Store. Handlers enforce strict `TenantIsolationError` enforcer. | **Mitigated** |
| **Repudiation** | Client denies performing aggregate state modification | Medium | Every state mutation appends an immutable, timestamped, correlated event envelope containing `userId` and `tenantId`. | **Mitigated** |
| **Information Disclosure** | Cross-tenant data leakage or unencrypted data at rest | Critical | Application-level `enforceTenantIsolation()` checks. DynamoDB tables and SQS queues encrypted with KMS CMK (`enable_key_rotation = true`). S3 Public Access Blocked. | **Mitigated** |
| **Denial of Service (DoS)** | Request flood targeting `POST /assets` or API endpoints | High | AWS WAFv2 Web ACL (`RateLimitPerIP` — 1,000 req / 5 min per IP + AWS Managed Rules). Serverless auto-scaling. | **Mitigated** |
| **Elevation of Privilege** | Standard `User` role attempting `Service` step result updates | High | Handler enforces Role-Based Access Control (`enforceRBAC()`). `Service` or `Admin` role required for `/step-results`. | **Mitigated** |
