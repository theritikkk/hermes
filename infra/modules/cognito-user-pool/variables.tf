variable "name" {
  type = string
}
variable "mfa_configuration" {
  type    = string
  default = "OFF"
}
variable "tags" {
  type    = map(string)
  default = {}
}
