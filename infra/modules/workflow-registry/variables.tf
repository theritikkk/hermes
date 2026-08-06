variable "environment" {
  type        = string
  description = "Target deployment environment (e.g. dev, staging, prod)"
}

variable "role_arn" {
  type        = string
  description = "IAM role ARN for Step Functions state machine execution"
}

variable "worker_arns" {
  type        = map(string)
  description = "Map of worker activity names to their Lambda function ARNs"
  default     = {}
}
