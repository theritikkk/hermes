variable "domain_name"   { type = string }
variable "engine_version" { type = string; default = "OpenSearch_2.11" }
variable "instance_type"  { type = string; default = "t3.small.search" }
variable "instance_count" { type = number; default = 1 }
variable "kms_key_arn"    { type = string }
variable "tags"           { type = map(string); default = {} }

resource "aws_opensearch_domain" "this" {
  domain_name    = var.domain_name
  engine_version = var.engine_version

  cluster_config {
    instance_type  = var.instance_type
    instance_count = var.instance_count
  }

  ebs_options {
    ebs_enabled = true
    volume_size = 10
    volume_type = "gp3"
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  tags = var.tags
}

output "domain_arn"       { value = aws_opensearch_domain.this.arn }
output "domain_endpoint"  { value = aws_opensearch_domain.this.endpoint }
