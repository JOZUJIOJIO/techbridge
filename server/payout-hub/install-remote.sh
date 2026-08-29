#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/techbridge-payout-hub}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/silicon-story-h5}"
read -r SUPABASE_SERVICE_ROLE_KEY || true
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
install -m 600 -o ubuntu -g ubuntu /tmp/techbridge-payout-hub-index.cjs "$REMOTE_DIR/index.cjs"
install -m 644 /tmp/techbridge-payout-hub.service /etc/systemd/system/techbridge-payout-hub.service
install -m 644 /tmp/techbridge-payout-hub-nginx.conf /etc/nginx/snippets/techbridge-payout-hub.conf

install -d -m 700 -o ubuntu -g ubuntu "$REMOTE_DIR/certs"
install -m 600 -o ubuntu -g ubuntu "$WXPAY_PRIVATE_SOURCE" "$REMOTE_DIR/certs/apiclient_key.pem"
install -m 600 -o ubuntu -g ubuntu "$WXPAY_PUBLIC_SOURCE" "$REMOTE_DIR/certs/wechatpay_public_key.pem"
install -d -m 700 -o ubuntu -g ubuntu "$REMOTE_DIR/assets"
install -m 600 -o ubuntu -g ubuntu /tmp/techbridge-skill-pack-001.zip "$REMOTE_DIR/assets/techbridge-skill-pack-001.zip"

EXISTING_ENV="$REMOTE_DIR/.env"
if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  SUPABASE_SERVICE_ROLE_KEY="$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
fi
if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Supabase service role key is unavailable" >&2
  exit 1
fi
OAUTH_STATE_SECRET="$(sed -n 's/^OAUTH_STATE_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
PAYOUT_HUB_API_SECRET="$(sed -n 's/^PAYOUT_HUB_API_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
WXPAY_TRANSFER_ENABLED="$(sed -n 's/^WXPAY_TRANSFER_ENABLED=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
WXPAY_PROFIT_SHARING_ENABLED="$(sed -n 's/^WXPAY_PROFIT_SHARING_ENABLED=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
PARTNER_REFERRAL_SECRET="$(sed -n 's/^PARTNER_REFERRAL_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
DISTRIBUTION_ADMIN_SECRET="$(sed -n 's/^DISTRIBUTION_ADMIN_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
SKILL_PACK_DOWNLOAD_SECRET="$(sed -n 's/^SKILL_PACK_DOWNLOAD_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
RESEND_API_KEY="$(sed -n 's/^RESEND_API_KEY=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
RESEND_FROM="$(sed -n 's/^RESEND_FROM=//p' "$EXISTING_ENV" 2>/dev/null | head -1 | sed 's/^"//;s/"$//')"
RESEND_SKILL_LETTER_SEGMENT_ID="$(sed -n 's/^RESEND_SKILL_LETTER_SEGMENT_ID=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
RESEND_AUDIENCE_SYNC_ENABLED="$(sed -n 's/^RESEND_AUDIENCE_SYNC_ENABLED=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
SKILL_STORE_PAYMENTS_ENABLED="$(sed -n 's/^SKILL_STORE_PAYMENTS_ENABLED=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
FEISHU_APP_ID="$(sed -n 's/^FEISHU_APP_ID=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
FEISHU_APP_SECRET="$(sed -n 's/^FEISHU_APP_SECRET=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
FEISHU_NOTIFY_OPEN_ID="$(sed -n 's/^FEISHU_NOTIFY_OPEN_ID=//p' "$EXISTING_ENV" 2>/dev/null | head -1)"
OAUTH_STATE_SECRET="${OAUTH_STATE_SECRET:-$(openssl rand -hex 32)}"
PAYOUT_HUB_API_SECRET="${PAYOUT_HUB_API_SECRET:-$(openssl rand -hex 32)}"
WXPAY_TRANSFER_ENABLED="${WXPAY_TRANSFER_ENABLED:-false}"
WXPAY_PROFIT_SHARING_ENABLED="${WXPAY_PROFIT_SHARING_ENABLED:-false}"
PARTNER_REFERRAL_SECRET="${PARTNER_REFERRAL_SECRET:-$(openssl rand -hex 32)}"
DISTRIBUTION_ADMIN_SECRET="${DISTRIBUTION_ADMIN_SECRET:-$(openssl rand -hex 32)}"
SKILL_PACK_DOWNLOAD_SECRET="${SKILL_PACK_DOWNLOAD_SECRET:-$(openssl rand -hex 32)}"
if [[ -n "$RESEND_API_KEY" ]]; then
  SKILL_STORE_PAYMENTS_ENABLED="${SKILL_STORE_PAYMENTS_ENABLED:-true}"
else
  SKILL_STORE_PAYMENTS_ENABLED=false
fi
ENV_TMP="$(mktemp)"
chmod 600 "$ENV_TMP"
{
  printf 'PORT=8792\n'
  printf 'PUBLIC_SITE_URL=https://skills.siliconstory.cn\n'
  printf 'SKILL_STORE_PUBLIC_URL=https://skills.siliconstory.cn/skills\n'
  printf 'WECHAT_APP_ID=%s\n' "$WX_APPID"
  printf 'WECHAT_APP_SECRET=%s\n' "$WX_APPSECRET"
  printf 'WECHAT_OAUTH_CALLBACK_URL=https://siliconstory.cn/techbridge/oauth/callback\n'
  printf 'WXPAY_PAYMENT_OAUTH_CALLBACK_URL=https://siliconstory.cn/techbridge/pay/callback\n'
  printf 'OAUTH_STATE_SECRET=%s\n' "$OAUTH_STATE_SECRET"
  printf 'PAYOUT_HUB_API_SECRET=%s\n' "$PAYOUT_HUB_API_SECRET"
  printf 'PARTNER_REFERRAL_SECRET=%s\n' "$PARTNER_REFERRAL_SECRET"
  printf 'DISTRIBUTION_ADMIN_SECRET=%s\n' "$DISTRIBUTION_ADMIN_SECRET"
  printf 'SKILL_PACK_DOWNLOAD_SECRET=%s\n' "$SKILL_PACK_DOWNLOAD_SECRET"
  printf 'SKILL_PACK_ISSUE_001_PATH=%s/assets/techbridge-skill-pack-001.zip\n' "$REMOTE_DIR"
  printf 'SKILL_PACK_ISSUE_001_KEY=issue-001/techbridge-skill-pack-001.zip\n'
  printf 'SKILL_STORE_PAYMENTS_ENABLED=%s\n' "$SKILL_STORE_PAYMENTS_ENABLED"
  printf 'SUPABASE_URL=https://jailsmonvfynyqjsyeur.supabase.co\n'
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SUPABASE_SERVICE_ROLE_KEY"
  printf 'WXPAY_MCHID=%s\n' "$WXPAY_MCHID"
  printf 'WXPAY_CERT_SERIAL=%s\n' "$WXPAY_CERT_SERIAL"
  printf 'WXPAY_API_V3_KEY=%s\n' "$WXPAY_API_V3_KEY"
  printf 'WXPAY_PRIVATE_KEY_PATH=%s/certs/apiclient_key.pem\n' "$REMOTE_DIR"
  printf 'WXPAY_PUBLIC_KEY_PATH=%s/certs/wechatpay_public_key.pem\n' "$REMOTE_DIR"
  printf 'WXPAY_TRANSFER_APPID=wxaab68c7822881159\n'
  printf 'WXPAY_TRANSFER_NOTIFY_URL=https://siliconstory.cn/techbridge/transfer/callback\n'
  printf 'WXPAY_PAYMENT_NOTIFY_URL=https://skills.siliconstory.cn/api/skill-store/wechat-notify\n'
  printf 'WXPAY_TRANSFER_ENABLED=%s\n' "$WXPAY_TRANSFER_ENABLED"
  printf 'WXPAY_PROFIT_SHARING_ENABLED=%s\n' "$WXPAY_PROFIT_SHARING_ENABLED"
  if [[ -n "$RESEND_API_KEY" ]]; then printf 'RESEND_API_KEY=%s\n' "$RESEND_API_KEY"; fi
  if [[ -n "$RESEND_FROM" ]]; then printf 'RESEND_FROM="%s"\n' "$RESEND_FROM"; fi
  if [[ -n "$RESEND_SKILL_LETTER_SEGMENT_ID" ]]; then printf 'RESEND_SKILL_LETTER_SEGMENT_ID=%s\n' "$RESEND_SKILL_LETTER_SEGMENT_ID"; fi
  printf 'RESEND_AUDIENCE_SYNC_ENABLED=%s\n' "${RESEND_AUDIENCE_SYNC_ENABLED:-false}"
  if [[ -n "$FEISHU_APP_ID" ]]; then printf 'FEISHU_APP_ID=%s\n' "$FEISHU_APP_ID"; fi
  if [[ -n "$FEISHU_APP_SECRET" ]]; then printf 'FEISHU_APP_SECRET=%s\n' "$FEISHU_APP_SECRET"; fi
  if [[ -n "$FEISHU_NOTIFY_OPEN_ID" ]]; then printf 'FEISHU_NOTIFY_OPEN_ID=%s\n' "$FEISHU_NOTIFY_OPEN_ID"; fi
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

rm -f /tmp/techbridge-payout-hub-index.cjs /tmp/techbridge-payout-hub.service /tmp/techbridge-payout-hub-nginx.conf /tmp/techbridge-payout-hub-install.sh /tmp/techbridge-skill-pack-001.zip
echo "techbridge-payout-hub deployed"
