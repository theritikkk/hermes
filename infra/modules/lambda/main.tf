variable "name" {
  type = string
}

variable "handler" {
  type = string
}

variable "runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "source_path" {
  type = string
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "policy_json" {
  type    = string
  default = null
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = var.source_path
  output_path = "${path.module}/../../.build/${var.name}.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "custom" {
  count = var.policy_json == null ? 0 : 1
  name  = "${var.name}-policy"
  role  = aws_iam_role.lambda.id
  policy = var.policy_json
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.lambda.arn
  handler       = var.handler
  runtime       = var.runtime
  filename      = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout       = 30

  environment {
    variables = var.environment
  }

  tags = {
    Project = "hermes"
  }
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "role_arn" {
  value = aws_iam_role.lambda.arn
}
