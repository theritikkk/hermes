run "verify_workflow_registry_defaults" {
  command = plan

  assert {
    condition     = aws_s3_bucket.workflow_templates.bucket_prefix == "hermes-workflow-templates-"
    error_message = "Workflow template bucket prefix must be 'hermes-workflow-templates-'"
  }

  assert {
    condition     = aws_dynamodb_table.workflow_definitions.hash_key == "PK"
    error_message = "Workflow definitions table hash key must be PK"
  }

  assert {
    condition     = aws_dynamodb_table.workflow_definitions.range_key == "SK"
    error_message = "Workflow definitions table range key must be SK"
  }
}
