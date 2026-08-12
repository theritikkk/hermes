run "verify_lambda_module_defaults" {
  command = plan

  assert {
    condition     = aws_lambda_function.this.runtime == "nodejs20.x" || aws_lambda_function.this.runtime == "provided.al2023" || aws_lambda_function.this.runtime == "python3.11"
    error_message = "Lambda runtime must be a supported environment"
  }
}
