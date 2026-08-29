import { newPortalToken, portalTokenHash } from '../functions/lib/partner-portal.js';

const partnerCode = String(process.argv[2] || '');
const days = Number(process.argv[3] || 90);
if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(partnerCode)) {
  console.error('用法: node scripts/create-partner-portal-link.mjs <partner-code> [有效天数]');
  process.exit(1);
}
if (!Number.isInteger(days) || days < 1 || days > 365) {
  console.error('有效天数必须是 1 到 365 的整数。');
  process.exit(1);
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const site = String(process.env.PUBLIC_SITE_URL || 'https://qiaobit.com').replace(/\/$/, '');
if (!supabaseUrl || !serviceRole) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。');
  process.exit(1);
}

const headers = { apikey: serviceRole, authorization: `Bearer ${serviceRole}`, 'content-type': 'application/json' };
const lookupParams = new URLSearchParams({ partner_code: `eq.${partnerCode}`, select: 'id,display_name,portal_enabled,status', limit: '1' });
const lookup = await fetch(`${supabaseUrl}/rest/v1/distribution_partners?${lookupParams}`, { headers });
const partner = (await lookup.json().catch(() => []))[0];
if (!lookup.ok || !partner) {
  console.error('没有找到这个渠道。');
  process.exit(1);
}
if (partner.status !== 'active' || partner.portal_enabled !== true) {
  console.error('渠道必须处于 active 且 portal_enabled=true。');
  process.exit(1);
}

const token = newPortalToken();
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const create = await fetch(`${supabaseUrl}/rest/v1/partner_portal_sessions`, {
  method: 'POST',
  headers: { ...headers, prefer: 'return=minimal' },
  body: JSON.stringify({ partner_id: partner.id, token_hash: portalTokenHash(token), expires_at: expiresAt })
});
if (!create.ok) {
  console.error(`创建失败: ${create.status} ${await create.text()}`);
  process.exit(1);
}

console.log(`渠道: ${partner.display_name}`);
console.log(`有效期至: ${expiresAt}`);
console.log(`专属后台: ${site}/partner-portal.html#token=${token}`);
