resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_iam_role" "this" {
  name = "${var.function_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "custom" {
  count  = var.policy_json != null ? 1 : 0
  name   = "${var.function_name}-policy"
  role   = aws_iam_role.this.id
  policy = var.policy_json
}

resource "aws_lambda_function" "this" {
  function_name    = var.function_name
  role             = aws_iam_role.this.arn
  filename         = var.filename
  source_code_hash = var.source_code_hash
  handler          = var.handler
  runtime          = var.runtime
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = var.environment_variables
  }

  dead_letter_config {
    target_arn = var.dlq_arn
  }

  tracing_config {
    mode = "Active"
  }

  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.this]
}

resource "aws_lambda_event_source_mapping" "sqs" {
  count            = var.sqs_trigger_arn != null ? 1 : 0
  event_source_arn = var.sqs_trigger_arn
  function_name    = aws_lambda_function.this.arn
  batch_size       = var.sqs_batch_size
}

resource "aws_cloudwatch_event_rule" "this" {
  count          = var.eventbridge_pattern != null ? 1 : 0
  name           = "${var.function_name}-trigger"
  event_bus_name = var.event_bus_name
  event_pattern  = var.eventbridge_pattern
  tags           = var.tags
}

resource "aws_cloudwatch_event_target" "this" {
  count          = var.eventbridge_pattern != null ? 1 : 0
  rule           = aws_cloudwatch_event_rule.this[0].name
  event_bus_name = var.event_bus_name
  target_id      = var.function_name
  arn            = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "eventbridge" {
  count         = var.eventbridge_pattern != null ? 1 : 0
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.this[0].arn
}
