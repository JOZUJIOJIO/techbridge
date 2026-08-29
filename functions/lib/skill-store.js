import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SKILL_STORE_PRODUCT_SLUG = 'ai-skills-annual';
export const SKILL_STORE_PLAN = 'skill_email_365';
export const SKILL_STORE_ORDER_TTL_MS = 30 * 60 * 1000;
export const SKILL_STORE_TOKEN_PATTERN = /^wpo_[A-Za-z0-9_-]{43}$/;

export function skillStoreToken() {
  return `wpo_${randomBytes(32).toString('base64url')}`;
}

export function skillStoreTokenHash(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export function skillStoreDeliveryToken(secret, orderId) {
  if (!secret || !/^[a-f0-9-]{36}$/.test(String(orderId || ''))) throw new Error('invalid_skill_store_delivery_input');
  return createHmac('sha256', secret).update(String(orderId), 'utf8').digest('hex');
}

export function skillStoreSafeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function skillStoreOrderNumber(now = Date.now()) {
  const time = now.toString(36).toUpperCase().padStart(9, '0');
  return `TBS${time}${randomBytes(7).toString('hex').toUpperCase()}`;
}

export function skillStoreSupabaseBase(env) {
  if (!env.SUPABASE_URL) throw new Error('missing_supabase_url');
  return env.SUPABASE_URL.replace(/\/$/, '');
}

export function skillStoreSupabaseHeaders(env, prefer) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing_supabase_service_key');
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

export async function skillStoreOrderByToken(env, token, select = '*') {
  if (!SKILL_STORE_TOKEN_PATTERN.test(String(token || ''))) return null;
  const params = new URLSearchParams({
    order_token_hash: `eq.${skillStoreTokenHash(token)}`,
    select,
    limit: '1'
  });
  const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders?${params}`, {
    headers: skillStoreSupabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`skill_store_order_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

export function skillStorePaymentUrl(env, token) {
  const hub = String(env.WECHAT_OAUTH_HUB_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
  return `${hub}/techbridge/pay/start?ticket=${encodeURIComponent(token)}`;
}

export function isWechatBrowser(request) {
  return /MicroMessenger/i.test(String(request.headers.get('user-agent') || ''));
}

export function skillStoreSiteUrl(env, request) {
  if (env.SKILL_STORE_PUBLIC_URL) return String(env.SKILL_STORE_PUBLIC_URL).replace(/\/$/, '');
  const origin = new URL(request.url).origin;
  return `${origin}/skills`;
}
