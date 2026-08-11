variable "name" {
  type = string
}

variable "routes" {
  type        = map(string)
  description = "Map of 'METHOD /path' route keys to the Lambda function ARN that should handle them"
}

variable "enable_jwt_authorizer" {
  type        = bool
  default     = false
  description = "Whether to attach a Cognito JWT Authorizer to the HTTP API routes"
}

variable "cognito_issuer_url" {
  type        = string
  default     = ""
  description = "Cognito User Pool Issuer URL for JWT validation"
}

variable "cognito_client_ids" {
  type        = list(string)
  default     = []
  description = "Cognito App Client IDs for audience verification"
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
  tags          = var.tags
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  count            = var.enable_jwt_authorizer ? 1 : 0
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name}-jwt-authorizer"

  jwt_configuration {
    audience = var.cognito_client_ids
    issuer   = var.cognito_issuer_url
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
  tags        = var.tags
}

resource "aws_apigatewayv2_integration" "this" {
  for_each = var.routes

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = var.routes

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.this[each.key].id}"
  authorization_type = var.enable_jwt_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_jwt_authorizer ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

resource "aws_lambda_permission" "apigw" {
  for_each = var.routes

  statement_id  = "AllowAPIGW-${replace(each.key, "/[^a-zA-Z0-9]/", "-")}"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

output "invoke_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "authorizer_id" {
  value = var.enable_jwt_authorizer ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

output "stage_arn" {
  value = aws_apigatewayv2_stage.default.arn
}
