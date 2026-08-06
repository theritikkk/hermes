CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL,
    definition TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL,
    UNIQUE(name, version, tenant_id)
);
CREATE INDEX idx_wf_definitions_name_status ON workflow_definitions(name, status);
CREATE INDEX idx_wf_definitions_tenant ON workflow_definitions(tenant_id);