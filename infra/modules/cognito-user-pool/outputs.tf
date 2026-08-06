output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}
output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}
output "client_id" {
  value = aws_cognito_user_pool_client.this.id
}
output "issuer_url" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}
