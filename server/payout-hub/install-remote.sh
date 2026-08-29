#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/techbridge-payout-hub}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/silicon-story-h5}"
read -r SUPABASE_SERVICE_ROLE_KEY
WX_APPID="$(sed -n 's/^WX_APPID=//p' /opt/worldcup/.env | head -1)"
WX_APPSECRET="$(sed -n 's/^WX_APPSECRET=//p' /opt/worldcup/.env | head -1)"
if [[ "$WX_APPID" != "wxaab68c7822881159" || -z "$WX_APPSECRET" ]]; then
  echo "Existing WeChat service-account credentials are unavailable" >&2
  exit 1
fi

install -d -m 700 -o ubuntu -g ubuntu "$REMOTE_DIR"
install -m 600 -o ubuntu -g ubuntu /tmp/techbridge-payout-hub-index.mjs "$REMOTE_DIR/index.mjs"
install -m 644 /tmp/techbridge-payout-hub.service /etc/systemd/system/techbridge-payout-hub.service
install -m 644 /tmp/techbridge-payout-hub-nginx.conf /etc/nginx/snippets/techbridge-payout-hub.conf

OAUTH_STATE_SECRET="$(openssl rand -hex 32)"
ENV_TMP="$(mktemp)"
chmod 600 "$ENV_TMP"
{
  printf 'PORT=8792\n'
  printf 'PUBLIC_SITE_URL=https://qiaobit.com\n'
  printf 'WECHAT_APP_ID=%s\n' "$WX_APPID"
  printf 'WECHAT_APP_SECRET=%s\n' "$WX_APPSECRET"
  printf 'WECHAT_OAUTH_CALLBACK_URL=https://siliconstory.cn/techbridge/oauth/callback\n'
  printf 'OAUTH_STATE_SECRET=%s\n' "$OAUTH_STATE_SECRET"
  printf 'SUPABASE_URL=https://jailsmonvfynyqjsyeur.supabase.co\n'
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SUPABASE_SERVICE_ROLE_KEY"
} > "$ENV_TMP"
install -m 600 -o ubuntu -g ubuntu "$ENV_TMP" "$REMOTE_DIR/.env"
rm -f "$ENV_TMP"

if ! grep -q 'techbridge-payout-hub.conf' "$NGINX_SITE"; then
  sed -i '0,/^  location \/ {/s//  include \/etc\/nginx\/snippets\/techbridge-payout-hub.conf;\n\n  location \/ {/' "$NGINX_SITE"
fi

systemctl daemon-reload
systemctl enable --now techbridge-payout-hub.service
nginx -t
systemctl reload nginx
systemctl is-active techbridge-payout-hub.service
curl -fsS http://127.0.0.1:8792/health >/dev/null

rm -f /tmp/techbridge-payout-hub-index.mjs /tmp/techbridge-payout-hub.service /tmp/techbridge-payout-hub-nginx.conf /tmp/techbridge-payout-hub-install.sh
echo "techbridge-payout-hub deployed"
