variable "name" {
  type = string
}

variable "routes" {
  type        = map(string)
  description = "Map of 'METHOD /path' route keys to the Lambda function ARN that should handle them"
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

# No JWT authorizer wired yet — routes are open. Wiring the Cognito
# authorizer (module.cognito) onto these routes is the next thing to do
# before this goes anywhere near real traffic.
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

  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.this[each.key].id}"
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
