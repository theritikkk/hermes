variable "project" {
  type        = string
  description = "Project name (hermes)"
  default     = "hermes"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  default     = "prod"
}

variable "primary_region" {
  type        = string
  description = "Primary AWS Region"
  default     = "us-east-1"
}

variable "secondary_region" {
  type        = string
  description = "Secondary Disaster Recovery AWS Region"
  default     = "us-west-2"
}

variable "enable_s3_crr" {
  type        = bool
  description = "Enable Cross-Region Replication for raw asset buckets"
  default     = true
}

variable "route53_domain_name" {
  type        = string
  description = "Domain name for Route 53 health-check failover"
  default     = "api.hermes.internal"
}
