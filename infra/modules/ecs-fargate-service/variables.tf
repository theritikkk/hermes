variable "service_name" { type = string }
variable "create_cluster" { type = bool, default = true }
variable "cluster_name" { type = string, default = "" }
variable "cluster_arn" { type = string, default = "" }
variable "container_image" { type = string }
variable "container_port" { type = number, default = 8080 }
variable "cpu" { type = string, default = "512" }
variable "memory" { type = string, default = "1024" }
variable "desired_count" { type = number, default = 1 }
variable "task_role_arn" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "target_group_arn" { type = string }
variable "assign_public_ip" { type = bool, default = false }
variable "allowed_cidr_blocks" { type = list(string), default = ["0.0.0.0/0"] }
variable "environment_variables" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
variable "tags" { type = map(string), default = {} }
