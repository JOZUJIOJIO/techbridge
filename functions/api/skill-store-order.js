import { activePartnerByCode, isPartnerCode, partnerFromRequest } from '../lib/partner-program.js';
import {
  SKILL_STORE_ORDER_TTL_MS,
  SKILL_STORE_PRODUCT_SLUG,
  SKILL_STORE_TOKEN_PATTERN,
  isWechatBrowser,
  skillStoreOrderByToken,
  skillStoreOrderNumber,
  skillStorePaymentUrl,
  skillStoreSupabaseBase,
  skillStoreSupabaseHeaders,
  skillStoreToken,
  skillStoreTokenHash
} from '../lib/skill-store.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'skills.siliconstory.cn'
      || host === '127.0.0.1'
      || host === 'localhost';
  } catch {
    return false;
  }
}

async function activeProduct(env) {
  const params = new URLSearchParams({
    slug: `eq.${SKILL_STORE_PRODUCT_SLUG}`,
    status: 'eq.active',
    select: 'id,slug,name,price_amount,currency,default_commission_amount',
    limit: '1'
  });
  const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/distribution_products?${params}`, {
    headers: skillStoreSupabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`skill_store_product_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

async function attributedPartner(env, request, reference) {
  const signedPartner = await partnerFromRequest(env, request);
  if (signedPartner) return signedPartner;
  return isPartnerCode(reference) ? activePartnerByCode(env, reference) : null;
}

export async function onRequestPost({ request, env }) {
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403);
  if (env.SKILL_STORE_PAYMENTS_ENABLED !== 'true' || !env.RESEND_API_KEY) {
    return json({ error: 'payments_not_ready', message: '微信支付正在完成邮件交付配置，请稍后再试。' }, 503);
  }
  const input = await request.json().catch(() => ({}));
  const email = String(input.email || '').trim().toLowerCase();
  const reference = String(input.ref || '').trim().toLowerCase();
  if (!isEmail(email)) return json({ error: 'invalid_email', message: '请填写有效邮箱。' }, 400);

  try {
    const product = await activeProduct(env);
    if (!product || Number(product.price_amount) !== 66_600 || String(product.currency).toLowerCase() !== 'cny') {
      return json({ error: 'product_unavailable', message: 'AI Skills 微信支付暂时不可用。' }, 503);
    }
    const partner = await attributedPartner(env, request, reference);
    const token = skillStoreToken();
    const orderNumber = skillStoreOrderNumber();
    const expiresAt = new Date(Date.now() + SKILL_STORE_ORDER_TTL_MS).toISOString();
    const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders`, {
      method: 'POST',
      headers: skillStoreSupabaseHeaders(env, 'return=representation'),
      body: JSON.stringify({
        order_number: orderNumber,
        order_token_hash: skillStoreTokenHash(token),
        product_id: product.id,
        partner_id: partner?.id || null,
        buyer_email: email,
        gross_amount: Number(product.price_amount),
        currency: 'cny',
        payment_provider: 'wechatpay',
        status: 'pending',
        expires_at: expiresAt
      })
    });
    if (!response.ok) throw new Error(`skill_store_order_create_failed:${response.status}`);

    const url = new URL(request.url);
    return json({
      success: true,
      provider: 'wechatpay',
      mode: isWechatBrowser(request) ? 'wechat' : 'qr',
      orderToken: token,
      amount: Number(product.price_amount),
      currency: 'cny',
      expiresAt,
      paymentUrl: skillStorePaymentUrl(env, token),
      qrUrl: `${url.origin}/api/skill-store/order-qr?ticket=${encodeURIComponent(token)}`,
      statusUrl: `${url.origin}/api/skill-store/order?ticket=${encodeURIComponent(token)}`
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'skill_store_order_create_failed', reason: error.message }));
    return json({ error: 'order_create_failed', message: '微信支付订单创建失败，请稍后再试。' }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  const token = String(new URL(request.url).searchParams.get('ticket') || '');
  if (!SKILL_STORE_TOKEN_PATTERN.test(token)) return json({ error: 'invalid_order_ticket' }, 400);
  try {
    const order = await skillStoreOrderByToken(env, token, 'id,status,gross_amount,currency,expires_at,paid_at,delivered_at');
    if (!order) return json({ error: 'order_not_found' }, 404);
    return json({
      success: true,
      status: order.status,
      amount: Number(order.gross_amount),
      currency: order.currency,
      expiresAt: order.expires_at,
      paidAt: order.paid_at,
      delivered: Boolean(order.delivered_at)
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'skill_store_order_status_failed', reason: error.message }));
    return json({ error: 'order_status_failed' }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
