# Staging environment — mirrors prod configuration with reduced capacity
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

variable "aws_region"   { type = string; default = "us-east-1" }
variable "project"      { type = string; default = "hermes" }
variable "environment"  { type = string; default = "staging" }
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
