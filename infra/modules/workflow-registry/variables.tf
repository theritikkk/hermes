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
  description = "Map of worker activity names to their Lambda function ARNs. When provided, these override the computed defaults."
  default     = {}
}

variable "aws_region" {
  type        = string
  description = "AWS region where Lambda functions are deployed"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID  used to construct Lambda ARN fallbacks when worker_arns are not supplied"
}
