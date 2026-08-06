variable "name" {
  type = string
}

resource "aws_cloudwatch_event_bus" "this" {
  name = var.name

  tags = {
    Project = "hermes"
  }
}

resource "aws_cloudwatch_event_archive" "this" {
  name             = "${var.name}-archive"
  event_source_arn = aws_cloudwatch_event_bus.this.arn
  retention_days   = 90
}


# Schema registry intentionally omitted.
# It adds value when multiple consumers interpret the same event differently
# and schema evolution needs to be governed. In Phase 1 there is one
# producer (command-api) and two consumers (outbox-publisher, execution-projection).
# Schema governance belongs in Phase 3 when external teams consume the event bus.

output "bus_name" {
  value = aws_cloudwatch_event_bus.this.name
}

output "bus_arn" {
  value = aws_cloudwatch_event_bus.this.arn
}

output "archive_arn" {
  value = aws_cloudwatch_event_archive.this.arn
}
