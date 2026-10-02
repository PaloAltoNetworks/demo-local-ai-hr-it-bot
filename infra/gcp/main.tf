/**
 * GCP landing zone for the preview: a VPC with pinned pod and service ranges, a GKE Autopilot
 * cluster, the Secret Manager entries the cluster reads through External Secrets Operator
 * (Workload Identity Federation for GKE, no key), and the identity GitHub Actions uses to deploy
 * (Workload Identity Federation, no static key).
 *
 * Secrets are created empty: their values are added by hand with `gcloud secrets versions add`
 * so they never land in the Terraform state. The project id comes from TF_VAR_project and is
 * never committed.
 *
 * ponytail: local state (gitignored). Move to a GCS backend once more than one person applies this.
 */

terraform {
  required_version = ">= 1.10"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

data "google_project" "this" {}

resource "google_project_service" "this" {
  for_each = toset([
    "container.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

/**
 * The service range is pinned because deploy/k8s/overlays/gcp gives the MCP services fixed
 * ClusterIPs inside it (the AIRS gateway maps *.otter-lab.com to them).
 */
resource "google_compute_network" "this" {
  name                    = var.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.this]
}

resource "google_compute_subnetwork" "this" {
  name          = var.name
  network       = google_compute_network.this.id
  region        = var.region
  ip_cidr_range = "10.10.0.0/20"

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.20.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "172.21.0.0/20"
  }
}

/**
 * Autopilot: Google runs the nodes and bills the pods' requests; the cluster fee is covered by
 * the GKE free tier for one cluster per billing account. Workload Identity Federation is on by
 * default. The Kubernetes version follows the REGULAR channel.
 */
resource "google_container_cluster" "this" {
  name                = var.name
  location            = var.region
  enable_autopilot    = true
  network             = google_compute_network.this.id
  subnetwork          = google_compute_subnetwork.this.id
  deletion_protection = false

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  release_channel {
    channel = "REGULAR"
  }
}

/**
 * Same names as on AWS (hyphens only), so deploy/k8s/base references the same keys on every
 * cloud. The preview has no auth-service: "auth" only holds the OAuth client secrets.
 */
resource "google_secret_manager_secret" "this" {
  for_each  = toset(["app-env", "airs-gw", "cloudflared", "auth"])
  secret_id = "${var.name}-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.this]
}

/**
 * External Secrets Operator reads the secrets above as the Kubernetes ServiceAccount the
 * external-secrets Helm chart creates (Workload Identity Federation for GKE, direct principal).
 */
resource "google_secret_manager_secret_iam_member" "external_secrets" {
  for_each  = google_secret_manager_secret.this
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "principal://iam.googleapis.com/projects/${data.google_project.this.number}/locations/global/workloadIdentityPools/${var.project}.svc.id.goog/subject/ns/external-secrets/sa/external-secrets"

  depends_on = [google_container_cluster.this]
}

/**
 * GitHub OIDC federation, accepted only for workflow jobs of var.github_repo that run in the
 * GitHub environment "gcp".
 */
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name}-github"
  depends_on                = [google_project_service.this]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "assertion.environment"
  }
  attribute_condition = "assertion.repository == '${var.github_repo}' && assertion.environment == 'gcp'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

/**
 * Deploy identity. container.admin because the deploy installs External Secrets Operator,
 * whose chart creates CRDs and cluster-wide RBAC.
 */
resource "google_service_account" "github_deploy" {
  account_id   = "${var.name}-github-deploy"
  display_name = "GitHub Actions deploy (${var.github_repo})"
}

resource "google_service_account_iam_member" "github_deploy" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

resource "google_project_iam_member" "github_deploy" {
  project = var.project
  role    = "roles/container.admin"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}
