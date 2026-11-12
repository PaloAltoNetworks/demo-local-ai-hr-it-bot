#!/usr/bin/env bash
#
# Writes new values of some keys into one cloud's hr-it-bot-app-env secret, leaving the other keys
# untouched, then asks the Restart workflow to reload them into the cluster.
#
#   AWS_PROFILE=otter scripts/rotate-secret.sh aws PORTKEY_API_KEY PORTKEY_API_KEY_GUARDED
#   scripts/rotate-secret.sh gcp PORTKEY_API_KEY PORTKEY_API_KEY_GUARDED
#
# Values come from ./.env when it exists, otherwise they are prompted (hidden), which is how it runs
# in AWS CloudShell: bash <(curl -fsSL https://raw.githubusercontent.com/PaloAltoNetworks/demo-local-ai-hr-it-bot/main/scripts/rotate-secret.sh) aws KEY...
# The GCP project is $GCP_PROJECT, or the "gcp" GitHub environment variable of the same name.
# Without gh (CloudShell), it prints the command that starts the Restart workflow.
set -euo pipefail

usage="usage: rotate-secret.sh <aws|gcp> KEY..."
cloud=${1:?$usage}
shift
(($#)) || { echo "$usage" >&2; exit 1; }

patch='{}'
for key in "$@"; do
  if [ -f .env ]; then
    value=$(node -p 'require("util").parseEnv(require("fs").readFileSync(".env", "utf8"))[process.argv[1]] ?? ""' "$key")
  else
    read -rsp "$key: " value </dev/tty
    echo
  fi
  [ -n "$value" ] || { echo "$key is empty" >&2; exit 1; }
  patch=$(jq -c --arg k "$key" --arg v "$value" '.[$k] = $v' <<<"$patch")
done

case $cloud in
  aws)
    current=$(aws secretsmanager get-secret-value --region eu-west-3 --secret-id hr-it-bot-app-env --query SecretString --output text)
    aws secretsmanager put-secret-value --region eu-west-3 --secret-id hr-it-bot-app-env \
      --secret-string "$(jq -c --argjson p "$patch" '. + $p' <<<"$current")" >/dev/null
    ;;
  gcp)
    project=${GCP_PROJECT:-$(gh variable get GCP_PROJECT --env gcp)}
    current=$(gcloud secrets versions access latest --secret hr-it-bot-app-env --project "$project")
    jq -c --argjson p "$patch" '. + $p' <<<"$current" \
      | gcloud secrets versions add hr-it-bot-app-env --project "$project" --data-file=- >/dev/null
    ;;
  *)
    echo "$usage" >&2
    exit 1
    ;;
esac
echo "hr-it-bot-app-env ($cloud) updated: $*"

restart="gh workflow run restart.yml --repo PaloAltoNetworks/demo-local-ai-hr-it-bot -f cloud=$cloud"
if command -v gh >/dev/null; then
  $restart
  echo "Restart workflow started: gh run watch --repo PaloAltoNetworks/demo-local-ai-hr-it-bot"
else
  echo "Now restart the pods from a machine with gh: $restart"
fi
