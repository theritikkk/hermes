variable "rule_name" {
  type        = string
  description = "Name of the EventBridge rule"
}

variable "event_bus_name" {
  type        = string
  description = "Name of the EventBridge bus"
}

variable "detail_type" {
  type        = string
  default     = "WorkflowExecutionStarted"
  description = "Event detail-type to match"
}

variable "state_machine_arn" {
  type        = string
  description = "ARN of the target Step Functions state machine"
}

variable "role_arn" {
  type        = string
  description = "IAM role ARN granting states:StartExecution to EventBridge"
}

variable "source_filter" {
  type        = list(string)
  default     = null
  description = "Optional list of event sources to match. If null or empty, matches any source on the event bus."
}

variable "dlq_arn" {
  type        = string
  default     = null
  description = "Optional SQS Queue ARN for Dead Letter Queue target to capture failed invocation events."
}

variable "maximum_retry_attempts" {
  type        = number
  default     = 3
  description = "Maximum number of retry attempts for target delivery (0-185)."
}

variable "maximum_event_age_in_seconds" {
  type        = number
  default     = 86400
  description = "Maximum age of an event in seconds (60-86400)."
}

locals {
  event_pattern = merge(
    { "detail-type" = [var.detail_type] },
    var.source_filter != null && length(var.source_filter) > 0 ? { source = var.source_filter } : {}
  )
}

# EventBridge -> Step Functions native target (no Lambda glue).
# Maps WorkflowExecutionStarted integration event payload to SFN execution input.
resource "aws_cloudwatch_event_rule" "this" {
  name           = var.rule_name
  event_bus_name = var.event_bus_name

  event_pattern = jsonencode(local.event_pattern)
}

resource "aws_cloudwatch_event_target" "sfn" {
  rule           = aws_cloudwatch_event_rule.this.name
  event_bus_name = var.event_bus_name
  target_id      = "StepFunctionsTarget"
  arn            = var.state_machine_arn
  role_arn       = var.role_arn

  input_transformer {
    input_paths = {
      executionId     = "$.detail.payload.executionId"
      tenantId        = "$.detail.tenantId"
      workflowName    = "$.detail.payload.workflowName"
      workflowVersion = "$.detail.payload.workflowVersion"
      assetId         = "$.detail.payload.assetId"
      s3Key           = "$.detail.payload.s3Key"
      correlationId   = "$.detail.correlationId"
      occurredAt      = "$.detail.occurredAt"
    }
    input_template = <<-EOF
      {
        "executionId": <executionId>,
        "tenantId": <tenantId>,
        "workflowName": <workflowName>,
        "workflowVersion": <workflowVersion>,
        "assetId": <assetId>,
        "s3Key": <s3Key>,
        "correlationId": <correlationId>,
        "occurredAt": <occurredAt>
      }
    EOF
  }

  retry_policy {
    maximum_event_age_in_seconds = var.maximum_event_age_in_seconds
    maximum_retry_attempts       = var.maximum_retry_attempts
  }

  dynamic "dead_letter_config" {
    for_each = var.dlq_arn != null ? [var.dlq_arn] : []
    content {
      arn = dead_letter_config.value
    }
  }
}

output "rule_name" {
  value       = aws_cloudwatch_event_rule.this.name
  description = "Name of the created EventBridge rule"
}

output "target_id" {
  value       = aws_cloudwatch_event_target.sfn.target_id
  description = "Target ID of the Step Functions target"
}

output "rule_arn" {
  value       = aws_cloudwatch_event_rule.this.arn
  description = "ARN of the created EventBridge rule"
}
