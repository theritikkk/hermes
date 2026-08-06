variable "name" {
  type = string
}

variable "lambda_arns" {
  type        = list(string)
  description = "ARNs of the worker Lambda functions this state machine is allowed to invoke"
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Role the Step Functions *state machine itself* assumes (distinct from the
# eventbridge-sfn-role module, which is what EventBridge assumes to call
# states:StartExecution on this state machine).
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = var.lambda_arns
  }

  # workflow-registry module enables tracing_configuration on every state
  # machine, which requires this even in dev.
  statement {
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "invoke" {
  name   = "${var.name}-invoke-workers"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.invoke.json
}

output "role_arn" {
  value = aws_iam_role.this.arn
}
