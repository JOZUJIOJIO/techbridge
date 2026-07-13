const PLAN_PRICE_ENV = {
  annual: 'STRIPE_PRICE_ID_ANNUAL',
  monthly: 'STRIPE_PRICE_ID_MONTHLY'
};

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
  const plan = payload.plan === 'monthly' ? 'monthly' : 'annual';
  const priceId = env[PLAN_PRICE_ENV[plan]] || env.STRIPE_PRICE_ID;
  const siteUrl = (env.PUBLIC_SITE_URL || sameOriginUrl(request, '')).replace(/\/$/, '');
  const successUrl = env.SUBSCRIPTION_SUCCESS_URL || `${siteUrl}/?subscription=success#member-subscribe`;
  const cancelUrl = env.SUBSCRIPTION_CANCEL_URL || `${siteUrl}/?subscription=cancel#member-subscribe`;

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return {
      missingConfig: true,
      message: '会员支付服务正在配置中，请稍后再试。'
    };
  }

  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('customer_email', payload.email);
  body.set('client_reference_id', payload.email);
  body.set('line_items[0][price]', priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  body.set('allow_promotion_codes', 'true');
  body.set('metadata[email]', payload.email);
  body.set('metadata[plan]', plan);
  body.set('metadata[source]', payload.source || 'qiaobit-homepage');
  body.set('subscription_data[metadata][email]', payload.email);
  body.set('subscription_data[metadata][plan]', plan);
  body.set('subscription_data[metadata][source]', payload.source || 'qiaobit-homepage');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded'
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
