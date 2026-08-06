locals {
  templates = {
    "document-pipeline-v1" = "${path.module}/../../../workflows/templates/document-pipeline-v1.json"
    "document-pipeline-v2" = "${path.module}/../../../workflows/templates/document-pipeline-v2.json"
    "approval-flow-v1"     = "${path.module}/../../../workflows/templates/approval-flow-v1.json"
    "batch-etl-v1"          = "${path.module}/../../../workflows/templates/batch-etl-v1.json"
  }
}

resource "aws_sfn_state_machine" "workflows" {
  for_each = local.templates

  name     = "hermes-${var.environment}-${each.key}"
  role_arn = var.role_arn

  definition = templatefile(each.value, merge(
    {
      validate_worker_arn      = lookup(var.worker_arns, "validate", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-validate-worker")
      ocr_worker_arn           = lookup(var.worker_arns, "ocr", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-ocr-worker")
      classify_worker_arn      = lookup(var.worker_arns, "classify", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-classify-worker")
      ner_worker_arn           = lookup(var.worker_arns, "ner", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-ner-worker")
      embed_worker_arn         = lookup(var.worker_arns, "embed", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-embed-worker")
      index_worker_arn         = lookup(var.worker_arns, "index", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-index-worker")
      saga_compensator_arn     = lookup(var.worker_arns, "compensator", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-saga-compensator")
      submit_worker_arn        = lookup(var.worker_arns, "submit", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-submit-worker")
      human_gate_worker_arn    = lookup(var.worker_arns, "human_gate", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-human-gate-worker")
      notify_worker_arn        = lookup(var.worker_arns, "notify", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-notify-worker")
      ingest_worker_arn        = lookup(var.worker_arns, "ingest", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-ingest-worker")
      transform_worker_arn     = lookup(var.worker_arns, "transform", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-transform-worker")
      validate_batch_worker_arn= lookup(var.worker_arns, "validate_batch", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-validate-batch-worker")
      load_worker_arn          = lookup(var.worker_arns, "load", "arn:aws:lambda:us-east-1:123456789012:function:hermes-dev-load-worker")
    },
    var.worker_arns
  ))

  tracing_configuration {
    enabled = true
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = "Hermes"
  }
}
