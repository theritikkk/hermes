# ── Multi-Region Disaster Recovery & Global Tables Module ──────────────────

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  prefix = "${var.project}-${var.environment}"
}

# ── DynamoDB Global Table (Event Store Replication) ─────────────────────────
resource "aws_dynamodb_table" "global_event_store" {
  name             = "${local.prefix}-global-event-store"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "PK"
  range_key        = "SK"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  replica {
    region_name = var.primary_region
  }

  replica {
    region_name = var.secondary_region
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Project      = var.project
    Environment  = var.environment
    Architecture = "Multi-Region Global Table"
  }
}

# ── S3 Cross-Region Replication (CRR) IAM Role ─────────────────────────────
resource "aws_iam_role" "crr_role" {
  count = var.enable_s3_crr ? 1 : 0

  name = "${local.prefix}-s3-crr-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# ── Route 53 CloudWatch Health Check for Primary Region ────────────────────
resource "aws_cloudwatch_metric_alarm" "primary_region_health" {
  alarm_name          = "${local.prefix}-primary-region-health"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Triggers Route 53 failover to secondary region when API Gateway 5XX errors spike."

  dimensions = {
    ApiName = "${local.prefix}-command-api"
  }
}

resource "aws_route53_health_check" "primary_health_check" {
  type                            = "CLOUDWATCH_METRIC"
  cloudwatch_alarm_name           = aws_cloudwatch_metric_alarm.primary_region_health.alarm_name
  cloudwatch_alarm_region         = var.primary_region
  insufficient_data_health_status = "Unhealthy"

  tags = {
    Name = "${local.prefix}-primary-health-check"
  }
}
