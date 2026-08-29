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

WXPAY_SOURCE_ENV="/opt/sucaitong/backend/.env"
WXPAY_MCHID="$(sed -n 's/^WECHAT_PAY_MCH_ID=//p' "$WXPAY_SOURCE_ENV" | head -1)"
WXPAY_CERT_SERIAL="$(sed -n 's/^WECHAT_PAY_SERIAL_NO=//p' "$WXPAY_SOURCE_ENV" | head -1)"
WXPAY_API_V3_KEY="$(sed -n 's/^WECHAT_PAY_API_V3_KEY=//p' "$WXPAY_SOURCE_ENV" | head -1)"
WXPAY_PRIVATE_SOURCE="$(sed -n 's/^WECHAT_PAY_PRIVATE_KEY_PATH=//p' "$WXPAY_SOURCE_ENV" | head -1)"
WXPAY_PUBLIC_SOURCE="$(sed -n 's/^WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=//p' "$WXPAY_SOURCE_ENV" | head -1)"
if [[ "$WXPAY_MCHID" != "1111987017" || -z "$WXPAY_CERT_SERIAL" || -z "$WXPAY_API_V3_KEY" ]]; then
  echo "Existing WeChat Pay merchant credentials are unavailable" >&2
  exit 1
fi

install -d -m 700 -o ubuntu -g ubuntu "$REMOTE_DIR"
install -m 600 -o ubuntu -g ubuntu /tmp/techbridge-payout-hub-index.mjs "$REMOTE_DIR/index.mjs"
install -m 600 -o ubuntu -g ubuntu /tmp/techbridge-payout-hub-wechat-transfer.mjs "$REMOTE_DIR/wechat-transfer.mjs"
install -m 644 /tmp/techbridge-payout-hub.service /etc/systemd/system/techbridge-payout-hub.service
install -m 644 /tmp/techbridge-payout-hub-nginx.conf /etc/nginx/snippets/techbridge-payout-hub.conf

install -d -m 700 -o ubuntu -g ubuntu "$REMOTE_DIR/certs"
install -m 600 -o ubuntu -g ubuntu "$WXPAY_PRIVATE_SOURCE" "$REMOTE_DIR/certs/apiclient_key.pem"
install -m 600 -o ubuntu -g ubuntu "$WXPAY_PUBLIC_SOURCE" "$REMOTE_DIR/certs/wechatpay_public_key.pem"

EXISTING_ENV="$REMOTE_DIR/.env"
OAUTH_STATE_SECRET="$(sed -n 's/^OAUTH_STATE_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
PAYOUT_HUB_API_SECRET="$(sed -n 's/^PAYOUT_HUB_API_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
WXPAY_TRANSFER_ENABLED="$(sed -n 's/^WXPAY_TRANSFER_ENABLED=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
OAUTH_STATE_SECRET="${OAUTH_STATE_SECRET:-$(openssl rand -hex 32)}"
PAYOUT_HUB_API_SECRET="${PAYOUT_HUB_API_SECRET:-$(openssl rand -hex 32)}"
WXPAY_TRANSFER_ENABLED="${WXPAY_TRANSFER_ENABLED:-false}"
ENV_TMP="$(mktemp)"
chmod 600 "$ENV_TMP"
{
  printf 'PORT=8792\n'
  printf 'PUBLIC_SITE_URL=https://qiaobit.com\n'
  printf 'WECHAT_APP_ID=%s\n' "$WX_APPID"
  printf 'WECHAT_APP_SECRET=%s\n' "$WX_APPSECRET"
  printf 'WECHAT_OAUTH_CALLBACK_URL=https://siliconstory.cn/techbridge/oauth/callback\n'
  printf 'OAUTH_STATE_SECRET=%s\n' "$OAUTH_STATE_SECRET"
  printf 'PAYOUT_HUB_API_SECRET=%s\n' "$PAYOUT_HUB_API_SECRET"
  printf 'SUPABASE_URL=https://jailsmonvfynyqjsyeur.supabase.co\n'
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SUPABASE_SERVICE_ROLE_KEY"
  printf 'WXPAY_MCHID=%s\n' "$WXPAY_MCHID"
  printf 'WXPAY_CERT_SERIAL=%s\n' "$WXPAY_CERT_SERIAL"
  printf 'WXPAY_API_V3_KEY=%s\n' "$WXPAY_API_V3_KEY"
  printf 'WXPAY_PRIVATE_KEY_PATH=%s/certs/apiclient_key.pem\n' "$REMOTE_DIR"
  printf 'WXPAY_PUBLIC_KEY_PATH=%s/certs/wechatpay_public_key.pem\n' "$REMOTE_DIR"
  printf 'WXPAY_TRANSFER_APPID=wxaab68c7822881159\n'
  printf 'WXPAY_TRANSFER_NOTIFY_URL=https://siliconstory.cn/techbridge/transfer/callback\n'
  printf 'WXPAY_TRANSFER_ENABLED=%s\n' "$WXPAY_TRANSFER_ENABLED"
} > "$ENV_TMP"
install -m 600 -o ubuntu -g ubuntu "$ENV_TMP" "$REMOTE_DIR/.env"
rm -f "$ENV_TMP"

if ! grep -q 'techbridge-payout-hub.conf' "$NGINX_SITE"; then
  sed -i '0,/^  location \/ {/s//  include \/etc\/nginx\/snippets\/techbridge-payout-hub.conf;\n\n  location \/ {/' "$NGINX_SITE"
fi

systemctl daemon-reload
systemctl enable techbridge-payout-hub.service
systemctl restart techbridge-payout-hub.service
nginx -t
systemctl reload nginx
systemctl is-active techbridge-payout-hub.service
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8792/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS http://127.0.0.1:8792/health >/dev/null

rm -f /tmp/techbridge-payout-hub-index.mjs /tmp/techbridge-payout-hub-wechat-transfer.mjs /tmp/techbridge-payout-hub.service /tmp/techbridge-payout-hub-nginx.conf /tmp/techbridge-payout-hub-install.sh
echo "techbridge-payout-hub deployed"
