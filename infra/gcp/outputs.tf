/** Values for the GitHub environment "gcp" (Settings > Environments > gcp > Variables). */
output "github_environment_variables" {
  value = {
    GCP_PROJECT      = var.project
    GCP_REGION       = var.region
    GKE_CLUSTER      = google_container_cluster.this.name
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SA    = google_service_account.github_deploy.email
  }
}

output "secret_names" {
  value = [for s in google_secret_manager_secret.this : s.secret_id]
}
