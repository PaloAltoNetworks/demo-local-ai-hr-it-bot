/** Values for the GitHub environment "gcp" (Settings > Environments > gcp > Variables). */
output "github_environment_variables" {
  value = {
    GCP_PROJECT = var.project
  }
}

output "secret_names" {
  value = [for s in google_secret_manager_secret.this : s.secret_id]
}
