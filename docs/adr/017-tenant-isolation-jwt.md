# ADR-017: Tenant Isolation via JWT Claims

## Status

Accepted

## Context

Relying on a `tenantId` provided directly in the request body is a significant security risk. It would allow any authenticated caller to spoof their tenant identifier and potentially write into or access another tenant's aggregate.

## Decision

The `tenantId` must be extracted exclusively from the Cognito JWT `custom:tenantId` claim using a Spring Security filter. We enforce tenant isolation through a three-layer defense:

1. **JWT claim validation:** Extract and trust only the tenant ID from the signed token.
2. **DynamoDB condition expressions:** Ensure operations are scoped to the parsed tenant ID.
3. **IAM `dynamodb:LeadingKeys` condition:** Enforce partition key isolation at the infrastructure layer.

## Consequences

**Positive**
- Deep defense in depth.
- Tenants cannot cross-contaminate data, even in the event of application-level bugs.

**Negative**
- Slightly increased complexity in local testing, requiring mock JWTs with valid claims.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Request body `tenantId` | Highly insecure; relies on client honesty and requires manual validation at every endpoint. |
