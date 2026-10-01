# Deploying to Kubernetes

Publishing a GitHub release builds the five images, pushes them to GHCR and deploys them to EKS. Everything runs in the cluster: the Otter (chatbot-v2), the three MCP servers, the Prisma AIRS AI Gateway (hybrid data plane), the magic-link auth service behind Caddy, and cloudflared. The Cloudflare tunnel only reaches Caddy, which lets signed-in `@paloaltonetworks.com` users through to the chatbot. Nothing else is exposed.

```
GitHub release vX.Y.Z
  └─ release.yml   build 5 images -> ghcr.io/paloaltonetworks/demo-local-ai-hr-it-bot/<svc>:vX.Y.Z
     └─ deploy.yml  OIDC login -> External Secrets -> kubectl apply -k -> helm airs-gw -> rollout

namespace hr-it-bot
  cloudflared ──> caddy:3010 ──(forward_auth)──> auth-service:3001 (SQLite on an EBS volume)
                      └─ signed in ──> chatbot-v2:3018 ──> airs-gw:8787 (LLM) / :8788 (MCP)
                                                              └─ *.otter-lab.com (hostAlias) ─> it-tools:3016, hr-tools:3017, it-triage:3019
  it-triage ──> it-tools, hr-tools (direct)
  External Secrets ──> cloud secret manager (hr-it-bot-app-env, -airs-gw, -cloudflared, -auth)
```

| Path | Role |
|---|---|
| `infra/aws/` | Terraform: VPC, EKS Auto Mode, Secrets Manager entries, Pod Identity for External Secrets, GitHub OIDC deploy role |
| `auth-service/` | Magic-link login (Better Auth), Caddy's `forward_auth` target |
| `deploy/k8s/base/` | Cloud-agnostic manifests: the 4 demo services, Caddy + auth-service, cloudflared, ExternalSecrets |
| `deploy/k8s/overlays/aws/` | `ClusterSecretStore` for Secrets Manager, EBS StorageClass, fixed ClusterIPs of the MCP services, public hostnames (`edge` ConfigMap) |
| `deploy/helm/airs-gw/` | Values for the `Portkey-AI/airs-gw-helm` chart (+ `values-aws.yaml` for hostAlias) |
| `.github/workflows/` | `release.yml` (build, then deploy), `deploy.yml` (deploy or roll back a version) |

## First-time setup (AWS)

1. **Cluster.** `terraform -chdir=infra/aws init && terraform -chdir=infra/aws apply`. It takes about 15 min. The state stays local (gitignored). If the account already has a GitHub OIDC provider, import it first:
   `terraform -chdir=infra/aws import aws_iam_openid_connect_provider.github arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com`
2. **Gateway registration.** In SCM: AI Gateway > Gateway Registration > Register New Gateway, then download `values.yaml`. You need `environment.data.PORTKEY_CLIENT_AUTH`, `environment.data.ORGANISATIONS_TO_SYNC` and the `imageCredentials` username/password. Register one gateway per cluster: every replica of the release shares its `client_auth`, and a separate registration per cluster tells the data planes apart in SCM logs.
3. **Cloudflare tunnel.** Zero Trust > Networks > Tunnels > Create (cloudflared). Keep the token. Add two published applications, both with service `http://caddy.hr-it-bot.svc.cluster.local:3010`: the app host and the login host set in `deploy/k8s/overlays/aws/kustomization.yaml` (`otter-v3.panw.pro`, `auth2.panw.pro`). No Cloudflare Access application: the auth service does the login, and the login host must stay public.
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

The auth service sets its session cookie on `.panw.pro` so the login host and the app host share it. Other auth instances on the same domain (the EC2 gateway on `auth.panw.pro`) use the default `better-auth.*` cookie name; this one is prefixed `otter-eks.*` (`AUTH_COOKIE_PREFIX`) so signing in on one never overwrites the other. Each instance has its own users and sessions.

## Chatbot workload identity (CyberArk SWA)

On EKS the chatbot reaches the AI Gateway with a CyberArk Secure Workload Access JWT-SVID instead of an API key (`chatbot-v2/backend/workload-identity.js`). The AWS overlay mounts the SWA agent's socket into the chatbot pod, so **the SWA server and agent must be installed before the chatbot** (values in `deploy/helm/swa/`, tenant settings in the `hr-it-bot-swa` secret, CyberArk charts kept out of this public repo). Without the agent the chatbot pod does not start: there is deliberately no API-key fallback.

- **Trust domain:** must sign in RS256 (`jwt.signature_algorithm`), the only algorithm the gateway accepts. Its JWKS (`https://<tenant>.secretsmgr.cyberark.cloud/api/swa/trust-domains/<td>/.well-known/jwks`) is declared in SCM: AI Gateway > Organisation > Authentication > JWT.
- **Gateway:** `JWT_ENABLED=ON` and `JWT_LOCAL_AUTH_DEFAULT_SCOPES` in `deploy/helm/airs-gw/values.yaml`. API keys keep working.
- **Configs:** a JWT has no attached config, so `hr-it-bot-app-env` must hold `PORTKEY_CONFIG` and `PORTKEY_CONFIG_GUARDED`, the slugs of the configs attached to the unguarded and guarded keys. The chatbot sends them in `x-portkey-config`; a guarded request without `PORTKEY_CONFIG_GUARDED` is refused. Admins cannot lock a config on a JWT: use Org-level Guardrails in SCM as the enforced floor.
- **Identity:** `spiffe://<td>/<node-group>/ns/hr-it-bot/sa/chatbot-v2` (dedicated ServiceAccount), shown in the chat next to each answer.
- **Trace links:** `PORTKEY_WORKSPACE_ID` and `PORTKEY_DEPLOYMENT_ID` in `hr-it-bot-app-env` (the cluster's SCM gateway registration, not the EC2 one) bring back the Portkey logo next to each answer.

## MCP origins and `*.otter-lab.com`

SCM registers the MCP servers as `http://{hr-tools,it-tools,it-triage}.otter-lab.com:{3017,3016,3019}/mcp`. The control plane only accepts a public TLD, and these names are not in public DNS. In the cluster:

- the gateway pod maps them with `hostAlias` (`deploy/helm/airs-gw/values-aws.yaml`),
- to fixed ClusterIPs of the MCP services (`deploy/k8s/overlays/aws/kustomization.yaml`), inside the service CIDR pinned by Terraform (`172.20.0.0/16`),
- and `TRUSTED_CUSTOM_HOSTS` lets the gateway's SSRF policy accept these private targets.

The two files must stay in sync.

## Adding Azure or GCP

The images, `deploy/k8s/base/` and `deploy/helm/airs-gw/values.yaml` do not change. A new cloud adds:

1. `infra/<cloud>/`: cluster (AKS/GKE) with a pinned service CIDR, a secret manager (Key Vault / Secret Manager) holding the 4 secrets under the same names, a workload identity for the `external-secrets/external-secrets` ServiceAccount, and a federated GitHub identity for the environment `<cloud>`.
2. `deploy/k8s/overlays/<cloud>/`: `ClusterSecretStore` named `cloud-secrets` (provider `azurekv` or `gcpsm`), the fixed ClusterIPs inside that cluster's service CIDR, and the `edge` ConfigMap with that deployment's hostnames and its own cookie prefix. AKS and GKE ship a default StorageClass, so no `storage-class.yaml`.
3. `deploy/helm/airs-gw/values-<cloud>.yaml`: the matching `hostAlias`.
4. `deploy.yml`: the login steps (`azure/login` + `az aks get-credentials`, or `google-github-actions/auth` + `get-gke-credentials`), the choice in `workflow_dispatch`, and a GitHub environment `<cloud>`. In `release.yml`, one more `deploy` job with `cloud: <cloud>`.

External Secrets may need extra ServiceAccount annotations on Azure/GCP (workload identity). Pass them as `--set` on its `helm upgrade` for that cloud.
