locals {
  templates = {
    "document-pipeline-v1" = "${path.module}/../../../workflows/templates/document-pipeline-v1.json"
    "document-pipeline-v2" = "${path.module}/../../../workflows/templates/document-pipeline-v2.json"
    "approval-flow-v1"     = "${path.module}/../../../workflows/templates/approval-flow-v1.json"
    "batch-etl-v1"         = "${path.module}/../../../workflows/templates/batch-etl-v1.json"
  }

  # Build ARN prefix from injected context — no hardcoded account IDs or regions
  fn_prefix = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:hermes-${var.environment}"

  # Resolved worker ARNs: caller-supplied map takes precedence; fallback is derived from deployment context
  resolved_arns = {
    validate_worker_arn       = lookup(var.worker_arns, "validate", "${local.fn_prefix}-validate-worker")
    ocr_worker_arn            = lookup(var.worker_arns, "ocr", "${local.fn_prefix}-ocr-worker")
    classify_worker_arn       = lookup(var.worker_arns, "classify", "${local.fn_prefix}-classify-worker")
    ner_worker_arn            = lookup(var.worker_arns, "ner", "${local.fn_prefix}-ner-worker")
    embed_worker_arn          = lookup(var.worker_arns, "embed", "${local.fn_prefix}-embed-worker")
    index_worker_arn          = lookup(var.worker_arns, "index", "${local.fn_prefix}-index-worker")
    saga_compensator_arn      = lookup(var.worker_arns, "compensator", "${local.fn_prefix}-saga-compensator")
    submit_worker_arn         = lookup(var.worker_arns, "submit", "${local.fn_prefix}-submit-worker")
    human_gate_worker_arn     = lookup(var.worker_arns, "human_gate", "${local.fn_prefix}-human-gate-worker")
    notify_worker_arn         = lookup(var.worker_arns, "notify", "${local.fn_prefix}-notify-worker")
    ingest_worker_arn         = lookup(var.worker_arns, "ingest", "${local.fn_prefix}-ingest-worker")
    transform_worker_arn      = lookup(var.worker_arns, "transform", "${local.fn_prefix}-transform-worker")
    validate_batch_worker_arn = lookup(var.worker_arns, "validate_batch", "${local.fn_prefix}-validate-batch-worker")
    load_worker_arn           = lookup(var.worker_arns, "load", "${local.fn_prefix}-load-worker")
  }
}

resource "aws_sfn_state_machine" "workflows" {
  for_each = local.templates

  name     = "hermes-${var.environment}-${each.key}"
  role_arn = var.role_arn

  definition = templatefile(each.value, merge(local.resolved_arns, var.worker_arns))

  tracing_configuration {
    enabled = true
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = "Hermes"
  }
}
