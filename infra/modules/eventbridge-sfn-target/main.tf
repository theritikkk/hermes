variable "rule_name" {
  type = string
}

variable "event_bus_name" {
  type = string
}

variable "detail_type" {
  type = string
}

variable "state_machine_arn" {
  type = string
}

variable "role_arn" {
  type = string
}

# EventBridge → Step Functions native target (no Lambda glue).
# Maps WorkflowExecutionStarted integration event payload to SFN execution input.
resource "aws_cloudwatch_event_rule" "this" {
  name           = var.rule_name
  event_bus_name = var.event_bus_name

  event_pattern = jsonencode({
    "detail-type" = [var.detail_type]
  })
}

resource "aws_cloudwatch_event_target" "sfn" {
  rule           = aws_cloudwatch_event_rule.this.name
  event_bus_name = var.event_bus_name
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
    }
    input_template = <<-EOF
      {
        "executionId": <executionId>,
        "tenantId": <tenantId>,
        "workflowName": <workflowName>,
        "workflowVersion": <workflowVersion>,
        "assetId": <assetId>,
        "s3Key": <s3Key>
      }
    EOF
  }

  retry_policy {
    maximum_event_age_in_seconds = 86400
    maximum_retry_attempts       = 3
  }
}

output "rule_arn" {
  value = aws_cloudwatch_event_rule.this.arn
}
