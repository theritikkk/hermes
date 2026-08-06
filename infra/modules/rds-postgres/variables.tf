variable "identifier" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "allocated_storage" {
  type    = number
  default = 20
}
variable "kms_key_arn" {
  type     = string
  nullable = true
  default  = null
}
variable "db_name" {
  type    = string
  default = "hermes"
}
variable "db_username" {
  type    = string
  default = "hermes"
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "backup_retention_days" {
  type    = number
  default = 7
}
variable "deletion_protection" {
  type    = bool
  default = false
}
variable "tags" {
  type    = map(string)
  default = {}
}
