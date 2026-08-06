output "workflow_arns" {
  value       = { for k, v in aws_sfn_state_machine.workflows : k => v.arn }
  description = "Map of workflow template names to State Machine ARNs"
}

output "workflow_names" {
  value       = [for k, v in aws_sfn_state_machine.workflows : v.name]
  description = "List of created Step Functions state machine names"
}
