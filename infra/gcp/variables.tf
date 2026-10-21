variable "project" {
  description = "GCP project id, from TF_VAR_project (never committed)."
  type        = string
}

variable "name" {
  description = "Prefix for the cluster, network, service accounts and Secret Manager entries."
  type        = string
  default     = "hr-it-bot"
}

variable "region" {
  type    = string
  default = "europe-west9"
}
