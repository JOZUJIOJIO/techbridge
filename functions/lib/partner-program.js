export const PARTNER_PRODUCT_PRICE = 66_600;
export const STANDARD_PARTNER_COMMISSION_AMOUNT = 20_000;
export const STRATEGIC_PARTNER_COMMISSION_AMOUNT = 40_000;
export const PARTNER_PAYOUT_DELAY_DAYS = 8;
export const PARTNER_ATTRIBUTION_DAYS = 30;
export const PARTNER_COOKIE_NAME = 'tb_partner';

function hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function isPartnerCode(value) {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(value || ''));
}

export async function createPartnerCookie(secret, partnerCode, issuedAt = Date.now()) {
  if (!secret || !isPartnerCode(partnerCode)) throw new Error('invalid_partner_cookie_input');
  const timestamp = Math.floor(issuedAt / 1000);
  const payload = `${partnerCode}.${timestamp}`;
  const signature = await hmac(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyPartnerCookie(secret, value, now = Date.now()) {
  if (!secret || !value) return null;
  const [partnerCode, timestampValue, signature] = String(value).split('.');
  if (!isPartnerCode(partnerCode) || !/^\d{10}$/.test(timestampValue || '') || !/^[a-f0-9]{64}$/.test(signature || '')) {
    return null;
  }
  const issuedAt = Number(timestampValue) * 1000;
  const maxAge = PARTNER_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000;
  if (issuedAt > now + 5 * 60 * 1000 || now - issuedAt > maxAge) return null;
  const expected = await hmac(secret, `${partnerCode}.${timestampValue}`);
  return constantTimeEqual(signature, expected) ? partnerCode : null;
}

export function cookieValue(header, name = PARTNER_COOKIE_NAME) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function partnerCookieHeader(value) {
  const maxAge = PARTNER_ATTRIBUTION_DAYS * 24 * 60 * 60;
  return `${PARTNER_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json'
  };
}

export async function activePartnerByCode(env, partnerCode) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !isPartnerCode(partnerCode)) return null;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({
    partner_code: `eq.${partnerCode}`,
    status: 'eq.active',
    select: 'id,partner_code,display_name,partner_tier,commission_amount,payout_delay_days,connect_account_id,payout_method',
    limit: '1'
  });
  const response = await fetch(`${base}/rest/v1/distribution_partners?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`partner_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

export async function partnerFromRequest(env, request) {
  const value = cookieValue(request.headers.get('cookie'));
  const partnerCode = await verifyPartnerCookie(env.PARTNER_REFERRAL_SECRET, value);
  return partnerCode ? activePartnerByCode(env, partnerCode) : null;
}

export function commissionForPartner(partner, amountTotal) {
  if (!partner || Number(amountTotal) !== PARTNER_PRODUCT_PRICE) return 0;
  const amount = Number(partner.commission_amount || STANDARD_PARTNER_COMMISSION_AMOUNT);
  return amount === STANDARD_PARTNER_COMMISSION_AMOUNT || amount === STRATEGIC_PARTNER_COMMISSION_AMOUNT
    ? amount
    : 0;
}
