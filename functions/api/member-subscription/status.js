const STRIPE_API_VERSION = '2026-02-25.clover';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function maskEmail(value) {
  const email = String(value || '').toLowerCase();
  const [name, domain] = email.split('@');
  if (!name || !domain) return '';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

function annualPeriodEnd(value) {
  const date = new Date(value * 1000);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

export async function onRequestGet({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'missing_config', message: '支付状态服务尚未配置。' }, 503);
  }

  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ error: 'invalid_session', message: '支付订单参数无效。' }, 400);
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: 'session_not_found', message: '未找到该支付订单。' }, 404);
  }

  const email = session.customer_details?.email || session.customer_email || session.metadata?.email || '';
  const paid = session.payment_status === 'paid';
  return json({
    success: true,
    paid,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total,
    currency: session.currency,
    email: maskEmail(email),
    plan: session.metadata?.plan || 'skill_email_365',
    membershipUntil: paid ? annualPeriodEnd(session.created) : null
  });
}
