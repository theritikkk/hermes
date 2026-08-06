variable "name" {
  type = string
}

variable "state_machine_arns" {
  type = list(string)
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "start_execution" {
  statement {
    actions   = ["states:StartExecution"]
    resources = var.state_machine_arns
  }
}

resource "aws_iam_role_policy" "start_execution" {
  name   = "${var.name}-start-execution"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.start_execution.json
}

output "role_arn" {
  value = aws_iam_role.this.arn
}
