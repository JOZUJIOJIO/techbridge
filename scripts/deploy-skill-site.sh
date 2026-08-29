#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/yewudao/.ssh/codexwx20260502.pem}"
SERVER="${SERVER:-ubuntu@175.178.75.176}"
STAMP="$(date -u +%Y%m%d%H%M%S)"
ARCHIVE="$(mktemp /tmp/ai-skills-site.XXXXXX.tar.gz)"
trap 'rm -f "$ARCHIVE"' EXIT

FILES=(
  skill-letter.html
  skill-letter.js
  skill-letter.css
  skill-letter-v2.css
  skill-letter-001-preview.webp
  skill-service-policy.html
  policy.css
  style.css
  favicon.svg
  favicon-32.png
  distribution-admin.html
  distribution-admin.css
  distribution-admin.js
  distribution-join.html
  distribution-join.css
  distribution-join.js
  partner-portal.html
  partner-portal.css
  partner-portal-mobile.css
  partner-portal.js
  channel-promotion.css
)

tar -C "$ROOT" -czf "$ARCHIVE" "${FILES[@]}"
scp -i "$SSH_KEY" "$ARCHIVE" "$SERVER:/tmp/ai-skills-site.tar.gz"
scp -i "$SSH_KEY" "$ROOT/server/skill-site/nginx.conf" "$SERVER:/tmp/ai-skills-site.nginx.conf"

ssh -i "$SSH_KEY" "$SERVER" "sudo bash -s -- '$STAMP'" <<'REMOTE'
set -euo pipefail
STAMP="$1"
BASE=/opt/ai-skills-site
RELEASE="$BASE/releases/$STAMP"
install -d -m 755 "$RELEASE"
tar -xzf /tmp/ai-skills-site.tar.gz -C "$RELEASE"
chown -R root:root "$RELEASE"
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +
ln -sfn "$RELEASE" "$BASE/current"
install -m 644 /tmp/ai-skills-site.nginx.conf /etc/nginx/sites-available/ai-skills-site
ln -sfn /etc/nginx/sites-available/ai-skills-site /etc/nginx/sites-enabled/ai-skills-site
nginx -t
systemctl reload nginx
rm -f /tmp/ai-skills-site.tar.gz /tmp/ai-skills-site.nginx.conf
find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk 'NR>5 {print $2}' | xargs -r rm -rf
REMOTE

echo "AI Skills site deployed to release $STAMP"
