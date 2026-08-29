import { createHash, randomBytes } from 'node:crypto';

function headers(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

function baseUrl(env) {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

export function portalTokenHash(token) {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function newPortalToken() {
  return `tbp_${randomBytes(32).toString('base64url')}`;
}

export function bearerToken(request) {
  const match = String(request.headers.get('authorization') || '').match(/^Bearer\s+(tbp_[A-Za-z0-9_-]{40,})$/);
  return match?.[1] || '';
}

export async function partnerPortalSession(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing_partner_portal_config');
  const token = bearerToken(request);
  if (!token) return null;
  const params = new URLSearchParams({
    token_hash: `eq.${portalTokenHash(token)}`,
    revoked_at: 'is.null',
    expires_at: `gt.${new Date().toISOString()}`,
    select: 'id,partner_id,expires_at,distribution_partners!inner(id,partner_code,display_name,partner_tier,commission_amount,payout_delay_days,payout_method,portal_enabled,wechat_openid,wechat_appid,wechat_bound_at,minimum_payout_amount,profit_sharing_receiver_status,status)',
    limit: '1'
  });
  const response = await fetch(`${baseUrl(env)}/rest/v1/partner_portal_sessions?${params}`, {
    headers: headers(env)
  });
  if (!response.ok) throw new Error(`partner_portal_session_failed:${response.status}`);
  const session = (await response.json())[0];
  const partner = session?.distribution_partners;
  if (!session || !partner || partner.status !== 'active' || partner.portal_enabled !== true) return null;
  return { session, partner };
}

export function partnerOrderLabel(value) {
  const compact = String(value || '').replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return compact ? `TB-${compact}` : 'TB-ORDER';
}

export function payoutBillNumber(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `TBP${day}${randomBytes(8).toString('hex').toUpperCase()}`;
}

export function money(amount, currency = 'cny') {
  const fractionDigits = Number(amount || 0) % 100 === 0 ? 0 : 2;
  return {
    amount: Number(amount || 0),
    currency: String(currency || 'cny').toLowerCase(),
    display: new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: String(currency || 'cny').toUpperCase(),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2
    }).format(Number(amount || 0) / 100)
  };
}

export function supabaseServiceHeaders(env, prefer) {
  return headers(env, prefer);
}

export function supabaseBaseUrl(env) {
  return baseUrl(env);
}
