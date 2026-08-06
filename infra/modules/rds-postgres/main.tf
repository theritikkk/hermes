# DB Subnet Group
resource "aws_db_subnet_group" "this" {
  name       = var.identifier
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

# Security Group
resource "aws_security_group" "this" {
  name   = "${var.identifier}-rds-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# Parameter Group
resource "aws_db_parameter_group" "this" {
  name   = "${var.identifier}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = var.tags
}

# RDS Instance
resource "aws_db_instance" "this" {
  identifier = var.identifier

  engine               = "postgres"
  engine_version       = "16.2"
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true
  kms_key_id           = var.kms_key_arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password   # Passed from Secrets Manager via Terraform variable

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.identifier}-final" : null

  # Performance Insights for query analysis
  performance_insights_enabled = true
  monitoring_interval          = 60

  tags = var.tags
}
