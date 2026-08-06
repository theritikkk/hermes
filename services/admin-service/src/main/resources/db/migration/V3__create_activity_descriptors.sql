CREATE TABLE activity_descriptors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL,
    runtime VARCHAR(50) NOT NULL,
    lambda_arn VARCHAR(1000) NOT NULL,
    timeout_seconds INT NOT NULL DEFAULT 300,
    retry_config TEXT,
    compensation_lambda_arn VARCHAR(1000),
    input_schema TEXT,
    output_schema TEXT,
    is_platform BOOLEAN NOT NULL DEFAULT false,
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL,
    UNIQUE(name, version, tenant_id)
);
CREATE INDEX idx_activities_platform ON activity_descriptors(is_platform) WHERE is_platform = true;