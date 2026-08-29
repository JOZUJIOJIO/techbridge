import { newPortalToken, portalTokenHash } from '../functions/lib/partner-portal.js';

const channelCode = String(process.argv[2] || '');
const displayName = String(process.argv.slice(3).join(' ') || '').trim();
if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(channelCode) || !displayName) {
  console.error('用法: npm run channel:create -- <channel-code> <渠道名称>');
  process.exit(1);
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const site = String(process.env.PUBLIC_SITE_URL || 'https://qiaobit.com').replace(/\/$/, '');
if (!supabaseUrl || !serviceRole) throw new Error('missing_supabase_config');
const headers = { apikey: serviceRole, authorization: `Bearer ${serviceRole}`, 'content-type': 'application/json' };

const response = await fetch(`${supabaseUrl}/rest/v1/distribution_partners?on_conflict=partner_code`, {
  method: 'POST',
  headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify({
    partner_code: channelCode,
    display_name: displayName,
    partner_tier: 'standard',
    commission_amount: 20_000,
    status: 'active',
    payout_delay_days: 8,
    payout_method: 'wechat_balance',
    portal_enabled: true,
    minimum_payout_amount: 10_000
  })
});
const partner = (await response.json().catch(() => []))[0];
if (!response.ok || !partner?.id) throw new Error(`channel_create_failed:${response.status}`);

const token = newPortalToken();
const session = await fetch(`${supabaseUrl}/rest/v1/partner_portal_sessions`, {
  method: 'POST',
  headers: { ...headers, prefer: 'return=minimal' },
  body: JSON.stringify({ partner_id: partner.id, token_hash: portalTokenHash(token), expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() })
});
if (!session.ok) throw new Error(`channel_session_failed:${session.status}`);

console.log(`渠道: ${displayName}`);
console.log(`渠道主入口: ${site}/channel#token=${token}`);
console.log(`推广链接: ${site}/s/${channelCode}`);
console.log(`推广二维码: ${site}/api/partner-qr?code=${channelCode}`);
