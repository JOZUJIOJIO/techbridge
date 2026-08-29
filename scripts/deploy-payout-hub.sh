#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/yewudao/.ssh/codexwx20260502.pem}"
SERVER="${SERVER:-ubuntu@175.178.75.176}"
REMOTE_DIR="/opt/techbridge-payout-hub"
NGINX_SITE="/etc/nginx/sites-enabled/silicon-story-h5"
ESBUILD="$ROOT/server/payout-hub/node_modules/.bin/esbuild"
BUNDLE="$(mktemp /tmp/ai-skills-domestic-service.XXXXXX.cjs)"
trap 'rm -f "$BUNDLE"' EXIT

"$ESBUILD" "$ROOT/server/payout-hub/production-entry.mjs" \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node22 \
  --outfile="$BUNDLE"

scp -i "$SSH_KEY" "$BUNDLE" "$SERVER:/tmp/techbridge-payout-hub-index.cjs"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/techbridge-payout-hub.service" "$SERVER:/tmp/techbridge-payout-hub.service"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/nginx-location.conf" "$SERVER:/tmp/techbridge-payout-hub-nginx.conf"
scp -i "$SSH_KEY" "$ROOT/server/payout-hub/install-remote.sh" "$SERVER:/tmp/techbridge-payout-hub-install.sh"
scp -i "$SSH_KEY" "$ROOT/newsletter/releases/001/techbridge-skill-pack-001.zip" "$SERVER:/tmp/techbridge-skill-pack-001.zip"

printf '\n' | ssh -i "$SSH_KEY" "$SERVER" "sudo env REMOTE_DIR='$REMOTE_DIR' NGINX_SITE='$NGINX_SITE' bash /tmp/techbridge-payout-hub-install.sh"
