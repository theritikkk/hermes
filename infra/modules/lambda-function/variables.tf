variable "function_name" { type = string }
variable "filename" {
  type    = string
  default = null
}
variable "source_code_hash" {
  type    = string
  default = null
}
variable "handler" { type = string }
variable "runtime" {
  type    = string
  default = "nodejs20.x"
}
variable "timeout" {
  type    = number
  default = 30
}
variable "memory_size" {
  type    = number
  default = 256
}
variable "environment_variables" {
  type    = map(string)
  default = {}
}
variable "policy_json" {
  type    = string
  default = null
}
variable "dlq_arn" { type = string }
variable "sqs_trigger_arn" {
  type    = string
  default = null
}
variable "sqs_batch_size" {
  type    = number
  default = 10
}
variable "eventbridge_pattern" {
  type    = string
  default = null
}
variable "event_bus_name" {
  type    = string
  default = "default"
}
variable "tags" {
  type    = map(string)
  default = {}
}
