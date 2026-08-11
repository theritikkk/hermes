data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name = var.name

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length    = 12
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
  }

  schema {
    name                = "tenantId"
    attribute_data_type = "String"
    mutable             = false
    required            = false
    string_attribute_constraints {
      min_length = 1
      max_length = 255
    }
  }

  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
    required            = false
    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  mfa_configuration = var.mfa_configuration
  tags              = var.tags
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Administrator group with full cross-tenant management access"
}

resource "aws_cognito_user_group" "user" {
  name         = "User"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Standard tenant user group"
}

resource "aws_cognito_user_group" "service" {
  name         = "Service"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Machine-to-machine service integration group"
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.name}-client"
  user_pool_id = aws_cognito_user_pool.this.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}
