# Deploying to Kubernetes

Publishing a GitHub release builds the four images, pushes them to GHCR and deploys them to EKS. Everything runs in the cluster: the Otter (chatbot-v2), the three MCP servers, the Prisma AIRS AI Gateway (hybrid data plane) and cloudflared. The chatbot is published through a Cloudflare tunnel. Nothing else is exposed.

```
GitHub release vX.Y.Z
  └─ release.yml   build 4 images -> ghcr.io/paloaltonetworks/demo-local-ai-hr-it-bot/<svc>:vX.Y.Z
     └─ deploy.yml  OIDC login -> External Secrets -> kubectl apply -k -> helm airs-gw -> rollout

namespace hr-it-bot
  cloudflared ──> chatbot-v2:3018 ──> airs-gw:8787 (LLM) / :8788 (MCP)
                                            └─ *.otter-lab.com (hostAlias) ─> it-tools:3016, hr-tools:3017, it-triage:3019
  it-triage ──> it-tools, hr-tools (direct)
  External Secrets ──> cloud secret manager (hr-it-bot-app-env, -airs-gw, -cloudflared)
```

| Path | Role |
|---|---|
| `infra/aws/` | Terraform: VPC, EKS Auto Mode, Secrets Manager entries, Pod Identity for External Secrets, GitHub OIDC deploy role |
| `deploy/k8s/base/` | Cloud-agnostic manifests: the 4 services, cloudflared, ExternalSecrets |
| `deploy/k8s/overlays/aws/` | `ClusterSecretStore` for Secrets Manager, fixed ClusterIPs of the MCP services |
| `deploy/helm/airs-gw/` | Values for the `Portkey-AI/airs-gw-helm` chart (+ `values-aws.yaml` for hostAlias) |
| `.github/workflows/` | `release.yml` (build, then deploy), `deploy.yml` (deploy or roll back a version) |

## First-time setup (AWS)

1. **Cluster.** `terraform -chdir=infra/aws init && terraform -chdir=infra/aws apply`. It takes about 15 min. The state stays local (gitignored). If the account already has a GitHub OIDC provider, import it first:
   `terraform -chdir=infra/aws import aws_iam_openid_connect_provider.github arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com`
2. **Gateway registration.** In SCM: AI Gateway > Gateway Registration > Register New Gateway, then download `values.yaml`. You need `environment.data.PORTKEY_CLIENT_AUTH`, `environment.data.ORGANISATIONS_TO_SYNC` and the `imageCredentials` username/password.
3. **Cloudflare tunnel.** Zero Trust > Networks > Tunnels > Create (cloudflared). Keep the token. Add a public hostname (e.g. `loutre.<domain>`) with service `http://chatbot-v2.hr-it-bot.svc.cluster.local:3018`.
4. **Secrets.** Values never go through Terraform:
   ```bash
   aws secretsmanager put-secret-value --secret-id hr-it-bot-app-env \
     --secret-string "$(node -p 'JSON.stringify(require("util").parseEnv(require("fs").readFileSync(".env","utf8")))')"
   aws secretsmanager put-secret-value --secret-id hr-it-bot-airs-gw \
     --secret-string '{"PORTKEY_CLIENT_AUTH":"...","ORGANISATIONS_TO_SYNC":"...","REGISTRY_USERNAME":"...","REGISTRY_PASSWORD":"..."}'
   aws secretsmanager put-secret-value --secret-id hr-it-bot-cloudflared \
     --secret-string '{"TUNNEL_TOKEN":"..."}'
   ```
   `app-env` is the demo `.env` as is. The cluster overrides `PORTKEY_BASE_URL`, `PORTKEY_MCP_BASE` and `IT_TRIAGE_MCP_URLS` to point at in-cluster services (`deploy/k8s/base/apps.yaml`). The `PORTKEY_MCP_*_SLUG` values must be the SCM slugs.
5. **GitHub.** Settings > Environments > New environment `aws`. Add the variables from `terraform -chdir=infra/aws output github_environment_variables` (`AWS_ROLE_ARN`, `AWS_REGION`, `EKS_CLUSTER`). After the first build, set the four GHCR packages to **public** (Package settings > Change visibility) so the cluster pulls them without credentials.
6. **First deploy.** Actions > Release > Run workflow with a version (e.g. `v0.1.1`). Or publish a release.

After a secret changes in Secrets Manager, External Secrets syncs it within the hour. Pods read env vars at startup, so restart them: `kubectl -n hr-it-bot rollout restart deploy`.

## Day to day

- **Release:** publish a GitHub release. The tag becomes the image tag.
- **Roll back:** Actions > Deploy > Run workflow with an older tag. The manifests come from the branch you run it from.
- **Status:** `aws eks update-kubeconfig --name hr-it-bot --region eu-west-3`, then `kubectl -n hr-it-bot get pods,externalsecrets`.
- **Demo data:** it-tools writes to its SQLite file inside the pod. Restarting the pod resets the demo data (`kubectl -n hr-it-bot rollout restart deploy/it-tools`).
- **Cost:** around $73/month for the control plane, $35 for the NAT gateway, plus the Auto Mode nodes. `terraform -chdir=infra/aws destroy` removes everything, secrets included.

## MCP origins and `*.otter-lab.com`

SCM registers the MCP servers as `http://{hr-tools,it-tools,it-triage}.otter-lab.com:{3017,3016,3019}/mcp`. The control plane only accepts a public TLD, and these names are not in public DNS. In the cluster:

- the gateway pod maps them with `hostAlias` (`deploy/helm/airs-gw/values-aws.yaml`),
- to fixed ClusterIPs of the MCP services (`deploy/k8s/overlays/aws/kustomization.yaml`), inside the service CIDR pinned by Terraform (`172.20.0.0/16`),
- and `TRUSTED_CUSTOM_HOSTS` lets the gateway's SSRF policy accept these private targets.

The two files must stay in sync.

## Adding Azure or GCP

The images, `deploy/k8s/base/` and `deploy/helm/airs-gw/values.yaml` do not change. A new cloud adds:

1. `infra/<cloud>/`: cluster (AKS/GKE) with a pinned service CIDR, a secret manager (Key Vault / Secret Manager) holding the 3 secrets under the same names, a workload identity for the `external-secrets/external-secrets` ServiceAccount, and a federated GitHub identity for the environment `<cloud>`.
2. `deploy/k8s/overlays/<cloud>/`: `ClusterSecretStore` named `cloud-secrets` (provider `azurekv` or `gcpsm`) and the fixed ClusterIPs inside that cluster's service CIDR.
3. `deploy/helm/airs-gw/values-<cloud>.yaml`: the matching `hostAlias`.
4. `deploy.yml`: the login steps (`azure/login` + `az aks get-credentials`, or `google-github-actions/auth` + `get-gke-credentials`), the choice in `workflow_dispatch`, and a GitHub environment `<cloud>`. In `release.yml`, one more `deploy` job with `cloud: <cloud>`.

External Secrets may need extra ServiceAccount annotations on Azure/GCP (workload identity). Pass them as `--set` on its `helm upgrade` for that cloud.
