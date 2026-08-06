resource "aws_sns_topic" "this" {
  name         = var.name
  display_name = var.display_name
  tags         = var.tags
}

resource "aws_sns_topic_policy" "this" {
  arn = aws_sns_topic.this.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudWatchAlarms"
      Effect    = "Allow"
      Principal = { Service = "cloudwatch.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.this.arn
    }]
  })
}
