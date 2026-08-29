#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/yewudao/.ssh/codexwx20260502.pem}"
SERVER="${SERVER:-ubuntu@175.178.75.176}"
PROJECT_REF="${PROJECT_REF:-jailsmonvfynyqjsyeur}"
REMOTE_DIR="/opt/techbridge-payout-hub"
NGINX_SITE="/etc/nginx/sites-enabled/silicon-story-h5"

supabase_key="$(supabase projects api-keys --project-ref "$PROJECT_REF" -o json | jq -er '.[] | select(.name == "service_role") | .api_key')"
if [[ -z "$supabase_key" ]]; then
  echo "Supabase service role key not found" >&2
  exit 1
fi

scp -i "$SSH_KEY" "$ROOT/server/payout-hub/index.mjs" "$SERVER:/tmp/techbridge-payout-hub-index.mjs"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/techbridge-payout-hub.service" "$SERVER:/tmp/techbridge-payout-hub.service"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/nginx-location.conf" "$SERVER:/tmp/techbridge-payout-hub-nginx.conf"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/install-remote.sh" "$SERVER:/tmp/techbridge-payout-hub-install.sh"

printf '%s\n' "$supabase_key" | ssh -i "$SSH_KEY" "$SERVER" "sudo env REMOTE_DIR='$REMOTE_DIR' NGINX_SITE='$NGINX_SITE' bash /tmp/techbridge-payout-hub-install.sh"
