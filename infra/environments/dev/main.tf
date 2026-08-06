terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
variable "project" {
  type    = string
  default = "hermes"
}
variable "environment" {
  type    = string
  default = "dev"
}
variable "image_tag" {
  type    = string
  default = "latest"
}

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
    event_store          = module.event_store.table_name
    execution_read_model = module.execution_read_model.table_name
  }

  tags = local.tags
}

# ── Outputs ────────────────────────────────────────────────
output "event_store_table" { value = module.event_store.table_name }
output "event_store_stream_arn" { value = module.event_store.stream_arn }
output "execution_read_model_table" { value = module.execution_read_model.table_name }
output "event_bus_name" { value = module.event_bus.bus_name }
output "raw_bucket_name" { value = module.raw_bucket.bucket_name }
output "outbox_queue_url" { value = module.outbox_queue.queue_url }
output "outbox_dlq_url" { value = module.outbox_queue.dlq_url }
output "kms_key_arn" { value = module.kms.key_arn }

# ── Cognito User Pool ──────────────────────────────────────
module "cognito" {
  source            = "../../modules/cognito-user-pool"
  name              = "${local.prefix}-users"
  mfa_configuration = "OFF" # dev only; staging/prod should be OPTIONAL
  tags              = local.tags
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

  enable_sqs_trigger = true
  sqs_trigger_arn    = module.outbox_queue.queue_arn
  sqs_batch_size     = 10

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
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = [
          module.event_store.table_arn,
          "${module.event_store.table_arn}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = "events:PutEvents"
        Resource = "arn:aws:events:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:event-bus/${module.event_bus.bus_name}"
      },
      {
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = module.outbox_queue.dlq_arn
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
  dlq_arn       = module.outbox_queue.dlq_arn # reuse outbox DLQ for all workers in dev

  eventbridge_pattern = jsonencode({
    source = ["hermes.command-api"]
    "detail-type" = [
      "WorkflowExecutionStarted",
      "StepCompleted",
      "StepFailed",
      "WorkflowExecutionCompleted",
      "WorkflowExecutionFailed"
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
  dlq_arn       = module.outbox_queue.dlq_arn # DLQ handler has no DLQ of its own (it consumes DLQs)

  enable_sqs_trigger = true
  sqs_trigger_arn    = module.outbox_queue.dlq_arn
  sqs_batch_size     = 1

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

# ── Phase 1 Core: Activity Workers (validate / ocr / classify) ─
# Invoked directly by Step Functions Task states. Each one calls
# runActivity() (shared/activity-runner), which writes StepCompleted/
# StepFailed events straight to the event store and publishes them to
# EventBridge on every invocation — this is not optional plumbing, so
# these need the same event-store/event-bus wiring command-api has.
module "validate_worker_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-validate-worker"
  filename      = local.placeholder_zip
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn
  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "validate-worker"
  }
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = [module.event_store.table_arn, "${module.event_store.table_arn}/index/*"]
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

module "ocr_worker_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-ocr-worker"
  filename      = local.placeholder_zip
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 512
  dlq_arn       = module.outbox_queue.dlq_arn
  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "ocr-worker"
  }
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = [module.event_store.table_arn, "${module.event_store.table_arn}/index/*"]
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

module "classify_worker_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-classify-worker"
  filename      = local.placeholder_zip
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn
  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "classify-worker"
  }
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = [module.event_store.table_arn, "${module.event_store.table_arn}/index/*"]
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

# ── Phase 1 Core: Step Functions execution role ────────────
# The role the *state machine itself* assumes to invoke the worker Lambdas
# above (distinct from the eventbridge-sfn-role below, which is what
# EventBridge assumes to call states:StartExecution).
module "sfn_exec_role" {
  source = "../../modules/sfn-exec-role"
  name   = "hermes-${var.environment}-sfn-role"
  lambda_arns = [
    module.validate_worker_lambda.function_arn,
    module.ocr_worker_lambda.function_arn,
    module.classify_worker_lambda.function_arn,
  ]
  tags = local.tags
}

# ── Phase 1 Core: command-api / query-api ──────────────────
module "command_api_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-command-api"
  filename      = local.placeholder_zip
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  # No WORKFLOW_STATE_MACHINE_ARN / states:StartExecution here on purpose.
  # shared/command-handlers explicitly documents that orchestration kickoff
  # happens via the EventBridge -> Step Functions native target
  # (module.eventbridge_sfn_target below), not a direct call from
  # command-api. The committed dist/handler.js has a leftover
  # startWorkflowExecution code path from an older design, but the current
  # command-handlers source never invokes it (it's not even in the
  # CommandHandlerDeps interface anymore) — giving this function
  # states:StartExecution would grant a permission nothing actually uses.
  environment_variables = {
    EVENT_STORE_TABLE = module.event_store.table_name
    EVENT_BUS_NAME    = module.event_bus.bus_name
    SERVICE_NAME      = "command-api"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"

    Statement = [

      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = [
          module.event_store.table_arn,
          "${module.event_store.table_arn}/index/*"
        ]
      },

      {
        Effect = "Allow"
        Action = "events:PutEvents"
        Resource = "arn:aws:events:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:event-bus/${module.event_bus.bus_name}"
      },

      {
        Effect = "Allow"
        Action = "sqs:SendMessage"
        Resource = module.outbox_queue.dlq_arn
      }

    ]
  })
  
  tags = local.tags
}

module "query_api_lambda" {
  source        = "../../modules/lambda-function"
  function_name = "${local.prefix}-query-api"
  filename      = local.placeholder_zip
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
  dlq_arn       = module.outbox_queue.dlq_arn

  environment_variables = {
    EXECUTION_READ_MODEL_TABLE = module.execution_read_model.table_name
    SERVICE_NAME               = "query-api"
  }

  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = module.execution_read_model.table_arn
    }]
  })

  tags = local.tags
}

# ── Phase 1 Core: HTTP API Gateway ──────────────────────────
# No JWT authorizer wired yet (module.cognito exists but auth is deferred
# per Section B — routes are open for today's smoke test). Wiring the
# Cognito authorizer onto these routes is the very next thing to do before
# this goes anywhere near real traffic.
module "http_api" {
  source = "../../modules/http-api"
  name   = "${local.prefix}-api"

  routes = {
    "POST /assets"                  = module.command_api_lambda.function_arn
    "POST /step-results"            = module.command_api_lambda.function_arn
    "GET /executions/{executionId}" = module.query_api_lambda.function_arn
  }

  tags = local.tags
}

# ── Phase 1 Core: EventBridge → Step Functions (native target) ─
# AssetRegistered/RegisterAsset commands cause command-api to call
# states:StartExecution directly today (see WORKFLOW_STATE_MACHINE_ARN
# above) — that's the synchronous path the smoke test exercises. This
# EventBridge rule is the async fan-out path for anything else that wants
# to react to WorkflowExecutionStarted without command-api knowing about it.
module "eventbridge_sfn_role" {
  source = "../../modules/eventbridge-sfn-role"
  name   = "${local.prefix}-eventbridge-sfn-role"
  state_machine_arns = [
    module.workflow_registry.workflow_arns["document-pipeline-v1"]
  ]
}

module "eventbridge_sfn_target" {
  source            = "../../modules/eventbridge-sfn-target"
  rule_name         = "${local.prefix}-workflow-execution-started"
  event_bus_name    = module.event_bus.bus_name
  detail_type       = "WorkflowExecutionStarted"
  state_machine_arn = module.workflow_registry.workflow_arns["document-pipeline-v1"]
  role_arn          = module.eventbridge_sfn_role.role_arn
}

# ── Replay Checkpoints S3 Bucket ───────────────────────────
module "replay_checkpoints_bucket" {
  source = "../../modules/s3-bucket"
  name   = "${local.prefix}-replay-checkpoints-${data.aws_caller_identity.current.account_id}"
}

# ── Phase 2: RDS PostgreSQL Configuration Database ─────────
# module "postgres" {
#   source               = "../../modules/rds-postgres"
#   identifier           = "${local.prefix}-postgres"
#   allocated_storage    = 20
#   db_name              = "hermes_admin"
#   username             = "hermes_admin"
#   kms_key_arn          = module.kms.key_arn
#   tags                 = local.tags
# }

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
      "StepCompleted",
      "WorkflowExecutionCompleted"
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
      "StepCompleted",
      "WorkflowExecutionCompleted"
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
      "WorkflowExecutionCompleted",
      "WorkflowExecutionFailed"
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
# Only document-pipeline-v1's three states have real worker ARNs wired below
# (validate/ocr/classify — Phase 1 scope). document-pipeline-v2,
# approval-flow-v1, and batch-etl-v1 still fall back to the module's dummy
# placeholder ARNs because those workers (ner/embed/index/etc.) don't exist
# yet — those three state machines will deploy but are not functional.
module "workflow_registry" {
  source      = "../../modules/workflow-registry"
  environment = var.environment
  role_arn    = module.sfn_exec_role.role_arn
  worker_arns = {
    validate = module.validate_worker_lambda.function_arn
    ocr      = module.ocr_worker_lambda.function_arn
    classify = module.classify_worker_lambda.function_arn
  }
}

# ── Additional Outputs ─────────────────────────────────────
output "cognito_user_pool_id" { value = module.cognito.user_pool_id }
output "cognito_client_id" { value = module.cognito.client_id }
output "cognito_issuer_url" { value = module.cognito.issuer_url }
output "replay_checkpoints_bucket" { value = module.replay_checkpoints_bucket.bucket_name }
# output "postgres_endpoint"         { value = module.postgres.endpoint }
output "opensearch_endpoint" { value = module.opensearch.domain_endpoint }
output "workflow_arns" { value = module.workflow_registry.workflow_arns }
output "api_invoke_url" { value = module.http_api.invoke_url }
output "command_api_function_name" { value = module.command_api_lambda.function_name }
output "query_api_function_name" { value = module.query_api_lambda.function_name }
output "validate_worker_function_name" { value = module.validate_worker_lambda.function_name }
output "ocr_worker_function_name" { value = module.ocr_worker_lambda.function_name }
output "classify_worker_function_name" { value = module.classify_worker_lambda.function_name }



