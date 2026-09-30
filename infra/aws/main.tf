/**
 * AWS landing zone for the demo: VPC, EKS Auto Mode cluster, the Secrets Manager
 * entries the cluster reads through External Secrets Operator, and the IAM role
 * GitHub Actions assumes (OIDC, no static keys) to deploy.
 *
 * Secrets are created empty: their values are put by hand with
 * `aws secretsmanager put-secret-value` so they never land in the Terraform state.
 *
 * ponytail: local state (gitignored). Move to an S3 backend once more than one
 * person applies this.
 */

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
  }
}

provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.name
  cidr = "10.0.0.0/16"

  azs             = local.azs
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

/**
 * The service CIDR is pinned because deploy/k8s/overlays/aws gives the MCP
 * services fixed ClusterIPs inside it (the AIRS gateway maps *.otter-lab.com to them).
 *
 * The Kubernetes version is EKS's default at creation. STANDARD support makes AWS
 * upgrade the cluster when standard support ends, instead of moving it to the
 * paid extended support.
 */
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name                   = var.name
  endpoint_public_access = true
  service_ipv4_cidr      = "172.20.0.0/16"
  upgrade_policy         = { support_type = "STANDARD" }

  enable_cluster_creator_admin_permissions = true

  compute_config = {
    enabled    = true
    node_pools = ["general-purpose"]
  }

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  access_entries = {
    github = {
      principal_arn = aws_iam_role.github_deploy.arn
      policy_associations = {
        admin = {
          policy_arn   = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }
}

/**
 * Secret names use hyphens only, the charset Azure Key Vault and GCP Secret Manager
 * also accept, so deploy/k8s/base references the same keys on every cloud.
 */
resource "aws_secretsmanager_secret" "this" {
  for_each = toset(["app-env", "airs-gw", "cloudflared", "auth"])

  name                    = "${var.name}-${each.key}"
  recovery_window_in_days = 0
}

/**
 * External Secrets Operator reads the secrets above through EKS Pod Identity, bound to
 * the ServiceAccount the external-secrets Helm chart creates.
 */
resource "aws_iam_role" "external_secrets" {
  name = "${var.name}-external-secrets"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy" "external_secrets" {
  role = aws_iam_role.external_secrets.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = [for s in aws_secretsmanager_secret.this : s.arn]
    }]
  })
}

resource "aws_eks_pod_identity_association" "external_secrets" {
  cluster_name    = module.eks.cluster_name
  namespace       = "external-secrets"
  service_account = "external-secrets"
  role_arn        = aws_iam_role.external_secrets.arn
}

/**
 * One GitHub OIDC provider per AWS account. If the account already has one,
 * import it instead of creating it (see docs/DEPLOY.md).
 */
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

/**
 * Deploy role, assumable only by workflow jobs of var.github_repo that run in the
 * GitHub environment "aws".
 */
resource "aws_iam_role" "github_deploy" {
  name = "${var.name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:aws"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "eks:DescribeCluster"
      Resource = module.eks.cluster_arn
    }]
  })
}
