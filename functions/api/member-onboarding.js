import { createContactWayViaBridge } from '../lib/wecom-bridge-client.js';
import {
  ANNUAL_MEMBER_PLAN,
  SKILL_EMAIL_PLAN,
  automationForPlan
} from '../../server/wecom-bridge/commerce-rules.mjs';

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
    select: 'stripe_checkout_session_id,state_token,status,automation_rule_key,contact_way_config_id,contact_qr_url,wecom_added_at,welcome_sent_at,group_joined_at,last_error,created_at'
  });
  const response = await fetch(`${base}/rest/v1/member_wecom_onboarding?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`supabase_onboarding_read_failed:${await response.text()}`);
  return (await response.json())[0] || null;
}

export function automationFromSession(session) {
  const explicitPlan = String(session.metadata?.plan || '');
  if (explicitPlan) return automationForPlan(explicitPlan);
  const inferredPlan = Number(session.amount_total || 0) === 19_900
    ? ANNUAL_MEMBER_PLAN
    : SKILL_EMAIL_PLAN;
  return automationForPlan(inferredPlan);
}

async function createOnboarding(env, session, email, automation) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/member_wecom_onboarding?on_conflict=stripe_checkout_session_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({
      stripe_checkout_session_id: session.id,
      email,
      state_token: stateToken(),
      status: 'waiting_for_wecom',
      automation_rule_key: automation.ruleKey
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

async function upsertPaidAttribution(env, session, email, automation) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const paidAt = new Date(Number(session.created || 0) * 1000 || Date.now()).toISOString();
  const response = await fetch(`${base}/rest/v1/customer_attributions?on_conflict=order_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      customer_key: `order:${session.id}`,
      email,
      rule_key: automation.ruleKey,
      source_channel: automation.sourceChannel,
      customer_type: automation.customerType,
      stage: 'paid',
      tag_names: [...automation.tagNames],
      order_id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      first_touch_at: paidAt,
      paid_at: paidAt,
      last_event: '支付成功',
      last_error: null,
      feishu_synced_at: null,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`supabase_attribution_save_failed:${await response.text()}`);
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
      message: '企业微信订阅服务正在配置中。',
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
    const automation = automationFromSession(session);
    let onboarding = await getOnboarding(env, sessionId);
    if (!onboarding) onboarding = await createOnboarding(env, session, email, automation);
    if (!onboarding.contact_qr_url) {
      const contactWay = await createContactWayViaBridge(env, onboarding.state_token);
      onboarding = await saveContactWay(env, sessionId, contactWay);
    }
    await upsertPaidAttribution(env, session, email, automation);

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
      message: '企业微信订阅入口暂时无法生成，请稍后重试。'
    }, 502);
  }
}
