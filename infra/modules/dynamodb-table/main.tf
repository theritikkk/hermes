variable "name" { type = string }
variable "hash_key" { type = string }
variable "range_key" { type = string }
variable "gsi" {
  type = list(object({
    name            = string
    hash_key        = string
    range_key       = string
    projection_type = string
  }))
  default = []
}
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "environment" { type = string }
variable "data_class" {
  type    = string
  default = "General"
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = var.hash_key
  range_key    = var.range_key

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  attribute {
    name = var.hash_key
    type = "S"
  }

  attribute {
    name = var.range_key
    type = "S"
  }

  dynamic "attribute" {
    for_each = toset(flatten([for g in var.gsi : [g.hash_key, g.range_key]]))
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = var.gsi
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = global_secondary_index.value.range_key
      projection_type = global_secondary_index.value.projection_type
    }
  }

  tags = merge(
    {
      Project     = "hermes"
      Environment = var.environment
      ManagedBy   = "terraform"
      DataClass   = var.data_class
    },
    var.tags
  )
}

output "table_name" { value = aws_dynamodb_table.this.name }
output "table_arn" { value = aws_dynamodb_table.this.arn }
output "stream_arn" { value = aws_dynamodb_table.this.stream_arn }
