variable "name" {
  type = string
}

variable "visibility_timeout_seconds" {
  type    = number
  default = 30
}

variable "message_retention_seconds" {
  type    = number
  default = 86400
}

variable "receive_wait_time_seconds" {
  type    = number
  default = 20
}

variable "max_receive_count" {
  type    = number
  default = 3
}

variable "dlq_retention_seconds" {
  type    = number
  default = 604800
}

variable "kms_key_id" {
  type    = string
  default = null
}

variable "allow_dynamodb_streams" {
  type    = bool
  default = false
}

variable "dynamodb_stream_arn" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}