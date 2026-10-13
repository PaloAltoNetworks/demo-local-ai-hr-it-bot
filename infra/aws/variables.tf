variable "name" {
  description = "Prefix for the cluster, VPC, IAM roles and Secrets Manager entries."
  type        = string
  default     = "hr-it-bot"
}

variable "region" {
  type    = string
  default = "eu-west-3"
}
