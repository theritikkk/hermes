terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

variable "aws_region"   { type = string; default = "us-east-1" }
variable "project"      { type = string; default = "hermes" }
variable "environment"  { type = string; default = "dev" }
variable "image_tag"    { type = string; default = "latest" }

locals {
  prefix = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── KMS Key ────────────────────────────────────────────────
module "kms" {
  source      = "../../modules/kms-key"
  description = "Hermes ${var.environment} encryption key"
  alias       = "${local.prefix}/main"
  tags        = local.tags
}

# ── Event Store ────────────────────────────────────────────
module "event_store" {
  source      = "../../modules/dynamodb-table"
  name        = "${local.prefix}-event-store"
  hash_key    = "PK"
  range_key   = "SK"
  kms_key_arn = module.kms.key_arn
  environment = var.environment
  data_class  = "EventStore"
  
  gsi = [{
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }, {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }]
  tags = local.tags
}

# ── Execution Read Model ───────────────────────────────────
module "execution_read_model" {
  source      = "../../modules/dynamodb-table"
  name        = "${local.prefix}-execution-read-model"
  hash_key    = "PK"
  range_key   = "SK"
  kms_key_arn = module.kms.key_arn
  environment = var.environment
  tags        = local.tags
}

# ── EventBridge ────────────────────────────────────────────
module "event_bus" {
  source = "../../modules/eventbridge"
  name   = "${local.prefix}-events"
}

# ── Outbox SQS Queue ───────────────────────────────────────
module "outbox_queue" {
  source                     = "../../modules/sqs-queue"
  name                       = "${local.prefix}-outbox"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20
  max_receive_count          = 3
  dlq_retention_seconds      = 604800
  kms_key_id                 = module.kms.key_id
  allow_dynamodb_streams     = true
  dynamodb_stream_arn        = module.event_store.stream_arn
  tags                       = local.tags
}

# ── S3 Raw Asset Bucket ────────────────────────────────────
module "raw_bucket" {
  source = "../../modules/s3-bucket"
  name   = "${local.prefix}-raw-${data.aws_caller_identity.current.account_id}"
}

# ── SNS Ops Alerts ─────────────────────────────────────────
module "ops_alerts" {
  source       = "../../modules/sns-topic"
  name         = "${local.prefix}-ops-alerts"
  display_name = "Hermes ${var.environment} Ops Alerts"
  tags         = local.tags
}

# ── CloudWatch Alarms ──────────────────────────────────────
module "alarms" {
  source        = "../../modules/cloudwatch-alarms"
  prefix        = local.prefix
  sns_topic_arn = module.ops_alerts.arn
  
  dlq_alarms = {
    outbox = { queue_name = module.outbox_queue.dlq_name }
  }
  
  dynamodb_table_names = {
    event_store        = module.event_store.table_name
    execution_read_model = module.execution_read_model.table_name
  }
  
  tags = local.tags
}

# ── Outputs ────────────────────────────────────────────────
output "event_store_table"         { value = module.event_store.table_name }
output "event_store_stream_arn"    { value = module.event_store.stream_arn }
output "execution_read_model_table" { value = module.execution_read_model.table_name }
output "event_bus_name"            { value = module.event_bus.bus_name }
output "raw_bucket_name"           { value = module.raw_bucket.bucket_name }
output "outbox_queue_url"          { value = module.outbox_queue.queue_url }
output "outbox_dlq_url"            { value = module.outbox_queue.dlq_url }
output "kms_key_arn"               { value = module.kms.key_arn }

# ── Cognito User Pool ──────────────────────────────────────
module "cognito" {
  source           = "../../modules/cognito-user-pool"
  name             = "${local.prefix}-users"
  mfa_configuration = "OFF"   # dev only; staging/prod should be OPTIONAL
  tags             = local.tags
}

# ── Lambda Workers ─────────────────────────────────────────
# Placeholder zip (replaced by deploy-lambdas.sh on first deploy)
locals {
  placeholder_zip = "${path.module}/placeholder.zip"
}

module "outbox_publisher_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-outbox-publisher"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  sqs_trigger_arn    = module.outbox_queue.queue_arn
  sqs_batch_size     = 10
  sqs_filter_pattern = "{}"

  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "outbox-publisher"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [module.event_store.table_arn, module.outbox_queue.queue_arn]
      },
      {
        Effect   = "Allow"
        Action   = "events:PutEvents"
        Resource = "arn:aws:events:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:event-bus/${module.event_bus.bus_name}"
      }
    ]
  })

  tags = local.tags
}

module "execution_projection_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-execution-projection"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn  # reuse outbox DLQ for all workers in dev

  eventbridge_pattern = jsonencode({
    source = ["hermes.command-api"]
    "detail-type" = [
      "WORKFLOW_EXECUTION_STARTED",
      "STEP_COMPLETED",
      "STEP_FAILED",
      "WORKFLOW_EXECUTION_COMPLETED",
      "WORKFLOW_EXECUTION_FAILED"
    ]
  })
  event_bus_name = module.event_bus.bus_name

  environment_variables = {
    EXECUTION_READ_MODEL_TABLE = module.execution_read_model.table_name
    SERVICE_NAME               = "execution-projection"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:UpdateItem"]
      Resource = module.execution_read_model.table_arn
    }]
  })

  tags = local.tags
}

module "snapshot_trigger_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-snapshot-trigger"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 512
  dlq_arn       = module.outbox_queue.dlq_arn

  environment_variables = {
    EVENT_STORE_TABLE  = module.event_store.table_name
    SNAPSHOT_THRESHOLD = "50"
    SERVICE_NAME       = "snapshot-trigger"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:Query", "dynamodb:PutItem"]
      Resource = module.event_store.table_arn
    }]
  })

  tags = local.tags
}

module "dlq_handler_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-dlq-handler"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 128
  dlq_arn       = module.outbox_queue.dlq_arn  # DLQ handler has no DLQ of its own (it consumes DLQs)

  sqs_trigger_arn = module.outbox_queue.dlq_arn
  sqs_batch_size  = 1

  environment_variables = {
    DLQ_NAME     = module.outbox_queue.dlq_name
    SERVICE_NAME = "dlq-handler"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = module.outbox_queue.dlq_arn
    }]
  })

  tags = local.tags
}

# ── Replay Checkpoints S3 Bucket ───────────────────────────
module "replay_checkpoints_bucket" {
  source = "../../modules/s3-bucket"
  name   = "${local.prefix}-replay-checkpoints-${data.aws_caller_identity.current.account_id}"
}

# ── Phase 2: RDS PostgreSQL Configuration Database ─────────
module "postgres" {
  source               = "../../modules/rds-postgres"
  identifier           = "${local.prefix}-postgres"
  allocated_storage    = 20
  db_name              = "hermes_admin"
  username             = "hermes_admin"
  kms_key_arn          = module.kms.key_arn
  tags                 = local.tags
}

# ── Phase 2: OpenSearch Search Index ───────────────────────
module "opensearch" {
  source      = "../../modules/opensearch"
  domain_name = "${local.prefix}-search"
  kms_key_arn = module.kms.key_arn
  tags        = local.tags
}

# ── Phase 2: OpenSearch Projection Lambda ──────────────────
module "opensearch_projection_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-opensearch-projection"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  eventbridge_pattern = jsonencode({
    source = ["hermes.command-api"]
    "detail-type" = [
      "STEP_COMPLETED",
      "WORKFLOW_EXECUTION_COMPLETED"
    ]
  })
  event_bus_name = module.event_bus.bus_name

  environment_variables = {
    OPENSEARCH_ENDPOINT = module.opensearch.domain_endpoint
    SERVICE_NAME        = "opensearch-projection"
  }

  tags = local.tags
}

# ── Phase 2: Tenant Usage Projection Lambda ─────────────────
module "usage_projection_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-usage-projection"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  eventbridge_pattern = jsonencode({
    source = ["hermes.command-api"]
    "detail-type" = [
      "STEP_COMPLETED",
      "WORKFLOW_EXECUTION_COMPLETED"
    ]
  })
  event_bus_name = module.event_bus.bus_name

  environment_variables = {
    SERVICE_NAME = "usage-projection"
  }

  tags = local.tags
}

# ── Phase 3: Webhook Dispatcher Lambda ─────────────────────
module "webhook_dispatcher_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-webhook-dispatcher"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  eventbridge_pattern = jsonencode({
    source = ["hermes.command-api"]
    "detail-type" = [
      "WORKFLOW_EXECUTION_COMPLETED",
      "WORKFLOW_EXECUTION_FAILED"
    ]
  })
  event_bus_name = module.event_bus.bus_name

  environment_variables = {
    SERVICE_NAME = "webhook-dispatcher"
  }

  tags = local.tags
}

# ── Phase 3: Outbox Periodic Republisher Lambda ────────────
module "outbox_republisher_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-outbox-republisher"
  filename      = local.placeholder_zip
  handler       = "dist/handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "outbox-republisher"
  }

  tags = local.tags
}

# ── Phase 4: Step Functions Workflow Registry Module ───────
module "workflow_registry" {
  source      = "../../modules/workflow-registry"
  environment = var.environment
  role_arn    = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/hermes-${var.environment}-sfn-role"
}

# ── Additional Outputs ─────────────────────────────────────
output "cognito_user_pool_id"      { value = module.cognito.user_pool_id }
output "cognito_client_id"         { value = module.cognito.client_id }
output "cognito_issuer_url"        { value = module.cognito.issuer_url }
output "replay_checkpoints_bucket" { value = module.replay_checkpoints_bucket.bucket_name }
output "postgres_endpoint"         { value = module.postgres.endpoint }
output "opensearch_endpoint"       { value = module.opensearch.domain_endpoint }
output "workflow_arns"             { value = module.workflow_registry.workflow_arns }



