# SQS DLQ depth alarm
resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  for_each = var.dlq_alarms

  alarm_name          = "${var.prefix}-dlq-${each.key}-depth"
  alarm_description   = "Messages in DLQ ${each.key} - immediate action required"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = each.value.queue_name
  }

  alarm_actions = [var.sns_topic_arn]
  ok_actions    = [var.sns_topic_arn]

  tags = var.tags
}

# EventBridge failed invocations
resource "aws_cloudwatch_metric_alarm" "eventbridge_failures" {
  alarm_name          = "${var.prefix}-eventbridge-failed-invocations"
  alarm_description   = "EventBridge is failing to deliver events"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedInvocations"
  namespace           = "AWS/Events"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.sns_topic_arn]
  tags          = var.tags
}

# DynamoDB system errors
resource "aws_cloudwatch_metric_alarm" "dynamodb_errors" {
  for_each = var.dynamodb_table_names

  alarm_name          = "${var.prefix}-dynamodb-${each.key}-errors"
  alarm_description   = "DynamoDB system errors on ${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = each.value
  }

  alarm_actions = [var.sns_topic_arn]
  tags          = var.tags
}

# Step Functions failed executions
resource "aws_cloudwatch_metric_alarm" "sfn_failures" {
  alarm_name          = "${var.prefix}-sfn-executions-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.sns_topic_arn]
  tags          = var.tags
}

# Lambda execution errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.prefix}-lambda-errors"
  alarm_description   = "Lambda execution errors detected across platform"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.sns_topic_arn]
  tags          = var.tags
}
