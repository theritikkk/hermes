variable "prefix" { type = string }
variable "sns_topic_arn" { type = string }
variable "dlq_alarms" {
  type = map(object({
    queue_name = string
  }))
  default = {}
}
variable "dynamodb_table_names" {
  type    = map(string)
  default = {}
}
variable "tags" {
  type    = map(string)
  default = {}
}
