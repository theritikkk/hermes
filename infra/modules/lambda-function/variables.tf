variable "function_name" {
  type        = string
  description = "Name of the Lambda function and associated log group / IAM role"
}

variable "filename" {
  type        = string
  description = "Path to the Lambda deployment package zip archive"
  default     = null
}

variable "source_code_hash" {
  type        = string
  description = "Base64-encoded SHA-256 hash of the package file for change detection"
  default     = null
}

variable "handler" {
  type        = string
  description = "Function entrypoint handler (e.g. dist/handler.handler)"
}

variable "runtime" {
  type        = string
  description = "Lambda execution runtime"
  default     = "nodejs20.x"
}

variable "enable_sqs_trigger" {
  type        = bool
  description = "Whether to create an SQS event source mapping for this function"
  default     = false
}

variable "timeout" {
  type        = number
  description = "Function execution timeout in seconds"
  default     = 30
}

variable "memory_size" {
  type        = number
  description = "Function allocated memory in MB"
  default     = 256
}

variable "environment_variables" {
  type        = map(string)
  description = "Map of environment variables provided to the function"
  default     = {}
}

variable "policy_json" {
  type        = string
  description = "JSON document string of custom IAM policy statements to attach to the execution role"
  default     = null
}

variable "dlq_arn" {
  type        = string
  description = "ARN of the SQS Dead Letter Queue (DLQ) for asynchronous failure delivery"
}

variable "sqs_trigger_arn" {
  type        = string
  description = "ARN of the SQS queue to attach as an event source mapping trigger"
  default     = null
}

variable "sqs_batch_size" {
  type        = number
  description = "Maximum batch size for SQS event source mapping"
  default     = 10
}

variable "eventbridge_pattern" {
  type        = string
  description = "JSON event pattern string for EventBridge rule trigger"
  default     = null
}

variable "event_bus_name" {
  type        = string
  description = "Name of the EventBridge bus for event triggers"
  default     = "default"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags map"
  default     = {}
}
