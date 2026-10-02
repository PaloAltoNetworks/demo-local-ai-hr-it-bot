# Deploying to Kubernetes

Publishing a GitHub release builds the five images, pushes them to GHCR and deploys them to production on EKS (`otter.panw.pro`). Publishing a **pre-release** does the same to the preview on GKE (`otter-preview.panw.pro`), a beta instance to try what is coming before it reaches production. Everything runs in the cluster: the Otter (chatbot-v2), the three MCP servers, the Prisma AIRS AI Gateway (hybrid data plane), the magic-link auth service behind Caddy, and cloudflared. The Cloudflare tunnel only reaches Caddy, which lets signed-in `@paloaltonetworks.com` users through to the chatbot. Nothing else is exposed.

```
GitHub release vX.Y.Z (production, aws) / pre-release vX.Y.Z-rc.N (preview, gcp)
  └─ release.yml   build 5 images -> ghcr.io/paloaltonetworks/demo-local-ai-hr-it-bot/<svc>:<tag>
     └─ deploy.yml  OIDC login -> External Secrets -> kubectl apply -k -> helm airs-gw -> rollout

namespace hr-it-bot
  cloudflared ──> caddy:3010 ──(forward_auth)──> auth-service:3001 (SQLite on an EBS volume, OAuth 2.1 authorization server)
                      └─ signed in ──> chatbot-v2:3018 ──> airs-gw:8787 (LLM) / :8788 (MCP)
                                                              └─ *.otter-lab.com (hostAlias) ─> it-tools:3016, hr-tools:3017, it-triage:3019
  it-triage ──> it-tools (direct), hr-tools (through airs-gw)
  External Secrets ──> cloud secret manager (hr-it-bot-app-env, -airs-gw, -cloudflared, -auth)
```

| Path | Role |
|---|---|
| `infra/aws/` | Terraform: VPC, EKS Auto Mode, Secrets Manager entries, Pod Identity for External Secrets, GitHub OIDC deploy role |
| `infra/gcp/` | Terraform for the preview: VPC, Cloud NAT, GKE Autopilot (private nodes), Secret Manager entries, Workload Identity for External Secrets and GitHub |
| `auth-service/` | Magic-link login (Better Auth), Caddy's `forward_auth` target |
| `deploy/k8s/base/` | Cloud-agnostic manifests: the 4 demo services, Caddy + auth-service, cloudflared, ExternalSecrets |
| `deploy/k8s/overlays/aws/` | `ClusterSecretStore` for Secrets Manager, EBS StorageClass, fixed ClusterIPs of the MCP services, public hostnames (`edge` ConfigMap) |
| `deploy/k8s/overlays/gcp/` | Preview: no auth-service (production's is used), its own Caddyfile, `ClusterSecretStore` for Secret Manager, fixed ClusterIPs, preview hostname |
| `deploy/helm/airs-gw/` | Values for the `Portkey-AI/airs-gw-helm` chart (+ `values-aws.yaml`, `values-gcp.yaml` for hostAlias) |
| `.github/workflows/` | `release.yml` (build, then deploy), `deploy.yml` (deploy or roll back a version) |

## First-time setup (AWS)

1. **Cluster.** `terraform -chdir=infra/aws init && terraform -chdir=infra/aws apply`. It takes about 15 min. The state stays local (gitignored). If the account already has a GitHub OIDC provider, import it first:
   `terraform -chdir=infra/aws import aws_iam_openid_connect_provider.github arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com`
2. **Gateway registration.** In SCM: AI Gateway > Gateway Registration > Register New Gateway, then download `values.yaml`. You need `environment.data.PORTKEY_CLIENT_AUTH`, `environment.data.ORGANISATIONS_TO_SYNC` and the `imageCredentials` username/password. Register one gateway per cluster: every replica of the release shares its `client_auth`, and a separate registration per cluster tells the data planes apart in SCM logs.
3. **Cloudflare tunnel.** Zero Trust > Networks > Tunnels > Create (cloudflared). Keep the token. Add two published applications, both with service `http://caddy.hr-it-bot.svc.cluster.local:3010`: the app host and the login host set in `deploy/k8s/overlays/aws/kustomization.yaml` (`otter.panw.pro`, `auth.panw.pro`). No Cloudflare Access application: the auth service does the login, and the login host must stay public.
4. **Secrets.** Values never go through Terraform. Run these in a terminal (the `read -s` prompts keep values off screen):
   ```bash
   aws secretsmanager put-secret-value --secret-id hr-it-bot-app-env \
     --secret-string "$(node -p 'JSON.stringify(require("util").parseEnv(require("fs").readFileSync(".env","utf8")))')"
   aws secretsmanager put-secret-value --secret-id hr-it-bot-airs-gw \
     --secret-string '{"PORTKEY_CLIENT_AUTH":"...","ORGANISATIONS_TO_SYNC":"...","REGISTRY_USERNAME":"...","REGISTRY_PASSWORD":"..."}'
   read -rs "T?Tunnel token: " && aws secretsmanager put-secret-value --secret-id hr-it-bot-cloudflared \
     --secret-string "{\"TUNNEL_TOKEN\":\"$T\"}"; unset T
   read "H?SMTP host: " && read "P?SMTP port [587]: " && read "U?SMTP username: " && read -rs "W?SMTP password: " && echo \
     && J=$(H="$H" P="${P:-587}" U="$U" W="$W" S="$(openssl rand -hex 32)" node -e 'const e=process.env;console.log(JSON.stringify({AUTH_SECRET:e.S,SMTP_HOST:e.H,SMTP_PORT:e.P,SMTP_USERNAME:e.U,SMTP_PASSWORD:e.W}))') \
     && aws secretsmanager put-secret-value --secret-id hr-it-bot-auth --secret-string "$J"; unset H P U W J
   # Secrets of the first-party OAuth clients (chatbot, it-triage), merged into the auth secret
   S=$(aws secretsmanager get-secret-value --secret-id hr-it-bot-auth --query SecretString --output text) \
     && aws secretsmanager put-secret-value --secret-id hr-it-bot-auth --secret-string "$(jq -c --arg a "$(openssl rand -hex 32)" --arg b "$(openssl rand -hex 32)" \
       '.CHATBOT_CLIENT_SECRET //= $a | .IT_TRIAGE_CLIENT_SECRET //= $b' <<<"$S")"; unset S
   ```
   `app-env` is the demo `.env` as is. The cluster overrides `PORTKEY_BASE_URL`, `PORTKEY_MCP_BASE` and `IT_TRIAGE_MCP_URLS` to point at in-cluster services (`deploy/k8s/base/apps.yaml`). The `PORTKEY_MCP_*_SLUG` values must be the SCM slugs. `AUTH_SECRET` is generated once per instance; changing it signs everyone out.
5. **GitHub.** Settings > Environments > New environment `aws`. Add the variables from `terraform -chdir=infra/aws output github_environment_variables` (`AWS_ROLE_ARN`, `AWS_REGION`, `EKS_CLUSTER`). The GHCR packages the release workflow creates inherit the public visibility of this repository, so the cluster pulls them without credentials.
6. **First deploy.** Actions > Release > Run workflow with a version (e.g. `v0.1.1`). Or publish a release.

After a secret changes in Secrets Manager, External Secrets syncs it within the hour (`kubectl -n hr-it-bot annotate externalsecret <name> force-sync=$(date +%s) --overwrite` to sync now). Pods read env vars at startup, so restart them: `kubectl -n hr-it-bot rollout restart deploy`.

## Day to day

- **Release:** publish a GitHub release. The tag becomes the image tag.
- **Roll back:** Actions > Deploy > Run workflow with an older tag. The manifests come from the branch you run it from.
- **Status:** `aws eks update-kubeconfig --name hr-it-bot --region eu-west-3`, then `kubectl -n hr-it-bot get pods,externalsecrets`.
- **Demo data:** it-tools writes to its SQLite file inside the pod. Restarting the pod resets the demo data (`kubectl -n hr-it-bot rollout restart deploy/it-tools`).
- **Sign-in:** magic link by email, restricted to `ALLOWED_EMAIL_DOMAIN`, sessions last 7 days. Users and sessions live on the `auth-data` volume and survive restarts and redeploys.
- **Cost:** around $73/month for the control plane, $35 for the NAT gateway, plus the Auto Mode nodes. `terraform -chdir=infra/aws destroy` removes everything, secrets included (delete the namespace first so the auth volume is released).

## Auth and other `*.panw.pro` sites

The auth service sets its session cookie on `.panw.pro` so the login host and the app host share it. Its name is prefixed `otter-eks.*` (`AUTH_COOKIE_PREFIX`), apart from the default `better-auth.*` of other auth instances on the domain, so signing in on one never overwrites another. Each instance has its own users and sessions.

## User and agent identity (OAuth 2.1)

The auth-service is also the OAuth 2.1 authorization server of the MCP servers. It issues RS256 JWT access tokens (JWKS at `https://auth.panw.pro/api/auth/jwks`) carrying the user's persona (`email_id`, `groups`, `employee_id`), the signed-in account (`login_email`), the client acting for the user (`chatbot`) and the MCP servers as audience (`OAUTH_RESOURCES`, `oauth` ConfigMap in `deploy/k8s/base/kustomization.yaml`). The chatbot sends the user's token to the gateway instead of an API key; the gateway forwards it to the MCP servers, which check it themselves (`mcp-server/shared/oauth-resource.js`).

- **Clients:** `chatbot` and `it-triage`, seeded by the auth-service at startup with the secrets of `hr-it-bot-auth` (step 4). The chatbot and it-triage read their secret from the same Secret.
- **SCM, organisation:** AI Gateway > Organisation > Authentication > JWT, JWKS URL `https://auth.panw.pro/api/auth/jwks`. The gateway runs `JWT_ENABLED=ON`; API keys keep working.
- **SCM, MCP integrations** (`configurations` of each integration, set through the SCM API): `"user_identity_forwarding": {"method": "bearer"}` on hr-tools, it-tools and it-triage, and a `jwt_validation` on `groups` with `matchType: contains` (JWKS URL as above): `["employees", "agents"]` on hr-tools, `["employees", "agents", "external"]` on it-tools and it-triage.
- **Configs:** a JWT has no attached config, so `hr-it-bot-app-env` must hold `PORTKEY_CONFIG` and `PORTKEY_CONFIG_GUARDED`, the slugs of the configs attached to the unguarded and guarded keys. Admins cannot lock a config on a JWT: use Org-level Guardrails in SCM as the enforced floor.
- **Trace links:** `PORTKEY_WORKSPACE_ID` and `PORTKEY_DEPLOYMENT_ID` in `hr-it-bot-app-env` (the cluster's SCM gateway registration) bring back the Portkey logo next to each answer.
- **Startup order:** the MCP servers read the auth-service discovery at startup and retry every 2 s until it answers; the chatbot retries its MCP connections every minute until they succeed.

The Idira SWA workload identity of 0.1.2 is set aside (code in the `v0.1.2` tag, values in `deploy/helm/swa/`); the workflow replay still draws it.

## MCP origins and `*.otter-lab.com`

SCM registers the MCP servers as `http://{hr-tools,it-tools,it-triage}.otter-lab.com:{3017,3016,3019}/mcp`. The control plane only accepts a public TLD, and these names are not in public DNS. In the cluster:

- the gateway pod maps them with `hostAlias` (`deploy/helm/airs-gw/values-aws.yaml`),
- to fixed ClusterIPs of the MCP services (`deploy/k8s/overlays/aws/kustomization.yaml`), inside the service CIDR pinned by Terraform (`172.20.0.0/16`),
- and `TRUSTED_CUSTOM_HOSTS` lets the gateway's SSRF policy accept these private targets.

The two files must stay in sync.

## Preview on GKE

The preview runs the same base on GKE Autopilot (`infra/gcp`, `deploy/k8s/overlays/gcp`), in its own GCP project. A pre-release deploys it; `Actions > Deploy` with `cloud: gcp` redeploys a tag. Production does not move until a regular release.

- **One sign-in, production's:** the AI Gateway checks JWTs against one JWKS per SCM organisation, so the preview has no auth-service. Caddy asks production's (`forward_auth https://auth.panw.pro`), and the chatbot and the MCP servers get and check their tokens there (`OAUTH_SERVER_URL=https://auth.panw.pro`). An auth-service change cannot be tried in the preview.
- **Setup:** `TF_VAR_project=<project> terraform -chdir=infra/gcp apply` (the project id is never committed; `GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)` works without application-default credentials). The organisation forbids public GKE nodes, so the nodes are private and egress goes through Cloud NAT.
- **Gateway:** its own SCM registration; its `values.yaml` fills `hr-it-bot-airs-gw` (`PORTKEY_CLIENT_AUTH`, `ORGANISATIONS_TO_SYNC`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`).
- **Secrets** (`gcloud secrets versions add <name> --project <project> --data-file=-`): `hr-it-bot-app-env` (the demo `.env` as JSON), `hr-it-bot-auth` (`CHATBOT_CLIENT_SECRET` and `IT_TRIAGE_CLIENT_SECRET`, the same as production's), `hr-it-bot-cloudflared` (token of the preview tunnel, whose public hostname `otter-preview.panw.pro` points to `http://caddy.hr-it-bot.svc.cluster.local:3010`).
- **GitHub:** environment `gcp` with the variables of `terraform -chdir=infra/gcp output github_environment_variables`.
- **kubectl:** `gcloud container clusters get-credentials hr-it-bot --region europe-west9 --project <project>` (needs the `gke-gcloud-auth-plugin` component). A VPN that inspects TLS breaks the connection to the GKE API; the public URLs still work.

## Adding another cloud

The images, `deploy/k8s/base/` and `deploy/helm/airs-gw/values.yaml` do not change. GCP was added this way for the preview; a new cloud (Azure) adds:

1. `infra/<cloud>/`: cluster (AKS/GKE) with a pinned service CIDR, a secret manager (Key Vault / Secret Manager) holding the 4 secrets under the same names, a workload identity for the `external-secrets/external-secrets` ServiceAccount, and a federated GitHub identity for the environment `<cloud>`.
2. `deploy/k8s/overlays/<cloud>/`: `ClusterSecretStore` named `cloud-secrets` (provider `azurekv` or `gcpsm`), the fixed ClusterIPs inside that cluster's service CIDR, and the `edge` ConfigMap with that deployment's hostnames and its own cookie prefix. AKS and GKE ship a default StorageClass, so no `storage-class.yaml`.
3. `deploy/helm/airs-gw/values-<cloud>.yaml`: the matching `hostAlias`.
4. `deploy.yml`: the login steps (`azure/login` + `az aks get-credentials`, or `google-github-actions/auth` + `get-gke-credentials`), the choice in `workflow_dispatch`, and a GitHub environment `<cloud>`. In `release.yml`, one more `deploy` job with `cloud: <cloud>`.

External Secrets may need extra ServiceAccount annotations on Azure/GCP (workload identity). Pass them as `--set` on its `helm upgrade` for that cloud.
