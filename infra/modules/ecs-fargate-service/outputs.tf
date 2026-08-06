output "service_name" { value = aws_ecs_service.this.name }
output "service_id" { value = aws_ecs_service.this.id }
output "task_definition_arn" { value = aws_ecs_task_definition.this.arn }
output "cluster_id" { value = var.create_cluster ? aws_ecs_cluster.this[0].id : null }
output "security_group_id" { value = aws_security_group.this.id }
