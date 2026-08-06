output "dlq_alarm_arns" {
  value = { for k, v in aws_cloudwatch_metric_alarm.dlq_depth : k => v.arn }
}
output "eventbridge_failures_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.eventbridge_failures.arn
}
output "dynamodb_errors_alarm_arns" {
  value = { for k, v in aws_cloudwatch_metric_alarm.dynamodb_errors : k => v.arn }
}
output "sfn_failures_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.sfn_failures.arn
}
