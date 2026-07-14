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

function hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSha256(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const actual = await hmacSha256(secret, signedPayload);
  return signatures.some((expected) => constantTimeEqual(actual, expected));
}

function localStatus(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') return 'canceled';
  return 'pending';
}

function stripeTime(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function annualPeriodEnd(value) {
  const date = value ? new Date(value * 1000) : new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

function supabaseHeaders(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

async function claimWebhookEvent(env, event) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return true;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/stripe_webhook_events?on_conflict=event_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({ event_id: event.id, event_type: event.type })
  });
  if (!res.ok) throw new Error(`Supabase webhook claim failed: ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

async function completeWebhookEvent(env, eventId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify({ processed_at: new Date().toISOString() })
  });
  if (!res.ok) throw new Error(`Supabase webhook completion failed: ${await res.text()}`);
}

async function releaseWebhookEvent(env, eventId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  await fetch(`${base}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: supabaseHeaders(env)
  });
}

async function retrieveSubscription(env, subscriptionId) {
  if (!env.STRIPE_SECRET_KEY || !subscriptionId) return null;
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  if (!res.ok) return null;
  return res.json();
}

async function upsertSubscriber(env, row) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true, reason: 'missing_supabase_config' };
  }

  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const headers = supabaseHeaders(env, 'resolution=merge-duplicates');
  const body = JSON.stringify({
    ...row,
    updated_at: new Date().toISOString()
  });

  if (row.email) {
    const res = await fetch(`${base}/rest/v1/paid_subscribers?on_conflict=email`, {
      method: 'POST',
      headers,
      body
    });
    if (!res.ok) throw new Error(`Supabase upsert failed: ${await res.text()}`);
    return { ok: true };
  }

  if (row.stripe_customer_id) {
    const res = await fetch(`${base}/rest/v1/paid_subscribers?stripe_customer_id=eq.${encodeURIComponent(row.stripe_customer_id)}`, {
      method: 'PATCH',
      headers,
      body
    });
    if (!res.ok) throw new Error(`Supabase update failed: ${await res.text()}`);
    return { ok: true };
  }

  return { skipped: true, reason: 'no_identity' };
}

async function sendWelcomeEmail(env, row) {
  if (!env.RESEND_API_KEY || !row.email || row.status !== 'active') {
    return { skipped: true };
  }

  const from = env.RESEND_FROM || 'Tech Bridge <newsletter@qiaobit.com>';
  const subject = '欢迎加入 Tech Bridge 会员信';
  const html = `
    <div style="font-family:Arial,'Noto Sans SC',sans-serif;line-height:1.8;color:#1A1A18">
      <h2>欢迎加入 Tech Bridge 会员信</h2>
      <p>你的订阅已开通。后续我会把 AI 产品实战、内容增长复盘、科技商业观察和项目进展内参发到这个邮箱。</p>
      <p>如果你需要更换邮箱或取消订阅，直接回复这封邮件即可。</p>
      <p style="color:#8A8580">Tech Bridge / 桥比特</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [row.email],
      subject,
      html
    })
  });

  if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
  return { ok: true };
}

async function rowFromCheckoutSession(env, session) {
  const subscription = await retrieveSubscription(env, session.subscription);
  const stripeStatus = subscription?.status || (session.payment_status === 'paid' ? 'active' : 'pending');
  const status = localStatus(stripeStatus);
  return {
    email: String(session.customer_details?.email || session.customer_email || session.metadata?.email || '').toLowerCase() || null,
    status,
    plan: session.metadata?.plan || subscription?.metadata?.plan || null,
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_checkout_session_id: session.id || null,
    current_period_end: subscription
      ? stripeTime(subscription.current_period_end)
      : status === 'active' ? annualPeriodEnd(session.created) : null,
    amount_total: session.amount_total ?? null,
    currency: session.currency || null,
    source: session.metadata?.source || subscription?.metadata?.source || 'stripe_checkout'
  };
}

function rowFromSubscription(subscription) {
  return {
    email: String(subscription.metadata?.email || '').toLowerCase() || null,
    status: localStatus(subscription.status),
    plan: subscription.metadata?.plan || null,
    stripe_customer_id: subscription.customer || null,
    stripe_subscription_id: subscription.id || null,
    stripe_payment_intent_id: null,
    current_period_end: stripeTime(subscription.current_period_end),
    amount_total: null,
    currency: subscription.currency || null,
    source: subscription.metadata?.source || 'stripe_subscription'
  };
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'missing_config', message: '缺少 STRIPE_WEBHOOK_SECRET。' }, 503);
  }

  const rawBody = await request.text();
  const isValid = await verifyStripeSignature(
    rawBody,
    request.headers.get('stripe-signature'),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!isValid) return json({ error: 'invalid_signature' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'bad_payload' }, 400);
  }

  try {
    const claimed = await claimWebhookEvent(env, event);
    if (!claimed) return json({ received: true, duplicate: true });

    let row = null;
    if (event.type === 'checkout.session.completed') {
      row = await rowFromCheckoutSession(env, event.data.object);
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      row = await rowFromCheckoutSession(env, event.data.object);
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      row = rowFromSubscription(event.data.object);
    }

    if (row) {
      await upsertSubscriber(env, row);
      if (
        row.status === 'active' &&
        (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
      ) {
        await sendWelcomeEmail(env, row);
      }
    }

    await completeWebhookEvent(env, event.id);
    return json({ received: true });
  } catch (error) {
    await releaseWebhookEvent(env, event?.id);
    return json({ error: 'webhook_processing_failed', message: error.message }, 500);
  }
}
