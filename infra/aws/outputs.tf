/** Values for the GitHub environment "aws" (Settings > Environments > aws > Variables). */
output "github_environment_variables" {
  value = {
    AWS_ROLE_ARN = aws_iam_role.github_deploy.arn
    AWS_REGION   = var.region
    EKS_CLUSTER  = module.eks.cluster_name
  }
}

output "secret_names" {
  value = [for s in aws_secretsmanager_secret.this : s.name]
}
