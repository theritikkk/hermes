resource "aws_kms_key" "this" {
  description             = var.description
  enable_key_rotation     = true
  deletion_window_in_days = 7
  multi_region            = false

  tags = var.tags
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.alias}"
  target_key_id = aws_kms_key.this.key_id
}
