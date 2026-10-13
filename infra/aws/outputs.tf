output "secret_names" {
  value = [for s in aws_secretsmanager_secret.this : s.name]
}
