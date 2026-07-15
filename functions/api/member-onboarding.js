import { createContactWayViaBridge } from '../lib/wecom-bridge-client.js';

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

function supabaseHeaders(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

function stateToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `m_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 26)}`;
}

async function stripeSession(env, sessionId) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('stripe_session_not_found');
  return session;
}

async function getOnboarding(env, sessionId) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({
    stripe_checkout_session_id: `eq.${sessionId}`,
    select: 'stripe_checkout_session_id,state_token,status,contact_way_config_id,contact_qr_url,wecom_added_at,welcome_sent_at,group_joined_at,last_error'
  });
  const response = await fetch(`${base}/rest/v1/member_wecom_onboarding?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`supabase_onboarding_read_failed:${await response.text()}`);
  return (await response.json())[0] || null;
}

async function createOnboarding(env, session, email) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/member_wecom_onboarding?on_conflict=stripe_checkout_session_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({
      stripe_checkout_session_id: session.id,
      email,
      state_token: stateToken(),
      status: 'waiting_for_wecom'
    })
  });
  if (!response.ok) throw new Error(`supabase_onboarding_create_failed:${await response.text()}`);
  const rows = await response.json();
  return rows[0] || getOnboarding(env, session.id);
}

async function saveContactWay(env, sessionId, contactWay) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(
    `${base}/rest/v1/member_wecom_onboarding?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env, 'return=representation'),
      body: JSON.stringify({
        contact_way_config_id: contactWay.config_id,
        contact_qr_url: contactWay.qr_code,
        last_error: null,
        updated_at: new Date().toISOString()
      })
    }
  );
  if (!response.ok) throw new Error(`supabase_contact_way_save_failed:${await response.text()}`);
  return (await response.json())[0] || null;
}

export async function onRequestGet({ request, env }) {
  const required = [
    'STRIPE_SECRET_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WECOM_BRIDGE_URL',
    'WECOM_BRIDGE_SECRET'
  ];
  if (required.some((key) => !env[key])) {
    return json({
      error: 'missing_config',
      message: '企业微信会员服务正在配置中。',
      configured: false
    }, 503);
  }

  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ error: 'invalid_session', message: '支付订单参数无效。' }, 400);
  }

  try {
    const session = await stripeSession(env, sessionId);
    if (session.payment_status !== 'paid') {
      return json({ error: 'payment_required', message: '订单尚未完成支付。' }, 402);
    }

    const email = String(session.customer_details?.email || session.customer_email || session.metadata?.email || '').toLowerCase();
    let onboarding = await getOnboarding(env, sessionId);
    if (!onboarding) onboarding = await createOnboarding(env, session, email);
    if (!onboarding.contact_qr_url) {
      const contactWay = await createContactWayViaBridge(env, onboarding.state_token);
      onboarding = await saveContactWay(env, sessionId, contactWay);
    }

    return json({
      success: true,
      configured: true,
      status: onboarding.status,
      qrCode: onboarding.contact_qr_url,
      wecomAdded: Boolean(onboarding.wecom_added_at),
      welcomeSent: Boolean(onboarding.welcome_sent_at),
      groupJoined: Boolean(onboarding.group_joined_at)
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'member_onboarding_failed', reason: error.message }));
    return json({
      error: 'onboarding_failed',
      message: '企业微信会员入口暂时无法生成，请稍后重试。'
    }, 502);
  }
}
