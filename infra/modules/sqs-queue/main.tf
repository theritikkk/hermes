# Dead Letter Queue
resource "aws_sqs_queue" "dlq" {
  name                       = "${var.name}-dlq"
  message_retention_seconds  = var.dlq_retention_seconds
  kms_master_key_id          = var.kms_key_id
  
  tags = var.tags
}

# Main Queue
resource "aws_sqs_queue" "this" {
  name                       = var.name
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = var.receive_wait_time_seconds
  kms_master_key_id          = var.kms_key_id
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
  
  tags = var.tags
}

# Allow DynamoDB Streams to send to this queue (for outbox pattern)
resource "aws_sqs_queue_policy" "this" {
  count     = var.allow_dynamodb_streams ? 1 : 0
  queue_url = aws_sqs_queue.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dynamodb.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.this.arn
      Condition = {
        ArnLike = {
          "aws:SourceArn" = var.dynamodb_stream_arn
        }
      }
    }]
  })
}
