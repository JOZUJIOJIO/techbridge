import { commissionForPartner, partnerFromRequest } from '../../lib/partner-program.js';

const STRIPE_API_VERSION = '2026-07-29.dahlia';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sameOriginUrl(request, path) {
  const origin = request.headers.get('origin') || new URL(request.url).origin;
  return `${origin}${path}`;
}

async function createStripeCheckoutSession(env, request, payload) {
  const plan = 'skill_email_365';
  const priceId = env.STRIPE_PRICE_ID_SKILL_EMAIL_V2 || env.STRIPE_PRICE_ID_SKILL_EMAIL;
  const siteUrl = (env.PUBLIC_SITE_URL || sameOriginUrl(request, '')).replace(/\/$/, '');
  const successUrl = env.SUBSCRIPTION_SUCCESS_URL || `${siteUrl}/?subscription=success&session_id={CHECKOUT_SESSION_ID}#member-subscribe`;
  const cancelUrl = env.SUBSCRIPTION_CANCEL_URL || `${siteUrl}/?subscription=cancel#member-subscribe`;

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return {
      missingConfig: true,
      message: 'AI Skills 年度买手服务支付正在配置中，请稍后再试。'
    };
  }

  const partner = await partnerFromRequest(env, request);
  const partnerCommission = commissionForPartner(partner, 66_600);

  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('customer_email', payload.email);
  body.set('customer_creation', 'always');
  body.set('client_reference_id', payload.email);
  body.set('line_items[0][price]', priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  body.set('allow_promotion_codes', partner ? 'false' : 'true');
  body.set('metadata[email]', payload.email);
  body.set('metadata[plan]', plan);
  body.set('metadata[source]', payload.source || 'qiaobit-homepage');
  body.set('metadata[offer]', 'founding_666');
  body.set('metadata[first_issue]', '001');
  if (partner && partnerCommission) {
    body.set('metadata[partner_id]', partner.id);
    body.set('metadata[partner_code]', partner.partner_code);
    body.set('metadata[partner_tier]', partner.partner_tier);
    body.set('metadata[partner_commission]', String(partnerCommission));
    body.set('metadata[partner_payout_delay]', String(partner.payout_delay_days || 8));
  }
  body.set('payment_intent_data[metadata][email]', payload.email);
  body.set('payment_intent_data[metadata][plan]', plan);
  body.set('payment_intent_data[metadata][source]', payload.source || 'qiaobit-homepage');
  body.set('payment_intent_data[metadata][offer]', 'founding_666');
  body.set('payment_intent_data[metadata][first_issue]', '001');
  if (partner && partnerCommission) {
    body.set('payment_intent_data[metadata][partner_id]', partner.id);
    body.set('payment_intent_data[metadata][partner_code]', partner.partner_code);
    body.set('payment_intent_data[metadata][partner_tier]', partner.partner_tier);
    body.set('payment_intent_data[metadata][partner_commission]', String(partnerCommission));
    body.set('payment_intent_data[metadata][partner_payout_delay]', String(partner.payout_delay_days || 8));
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': STRIPE_API_VERSION
    },
    body
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Stripe Checkout Session 创建失败');
  }
  return data;
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_request', message: '请求体不是有效 JSON。' }, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!isEmail(email)) {
    return json({ error: 'invalid_email', message: '请填写有效邮箱。' }, 400);
  }

  try {
    const session = await createStripeCheckoutSession(env, request, {
      email,
      plan: payload.plan,
      source: payload.source
    });

    if (session.missingConfig) {
      return json({ error: 'missing_config', message: session.message }, 503);
    }

    return json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    return json({
      error: 'checkout_failed',
      message: error.message || '创建订阅订单失败。'
    }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
