variable "name" {
  description = "Prefix for the cluster, VPC, IAM roles and Secrets Manager entries."
  type        = string
  default     = "hr-it-bot"
}

variable "region" {
  type    = string
  default = "eu-west-3"
}

variable "github_repo" {
  description = "owner/repo allowed to assume the deploy role (case-sensitive, as in the OIDC sub claim)."
  type        = string
  default     = "PaloAltoNetworks/demo-local-ai-hr-it-bot"
}
