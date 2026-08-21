import {
  ANNUAL_MEMBER_PLAN,
  SKILL_EMAIL_PLAN,
  automationForPlan
} from '../../server/wecom-bridge/commerce-rules.mjs';

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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return {};
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/stripe_webhook_events?on_conflict=event_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({ event_id: event.id, event_type: event.type })
  });
  if (!res.ok) throw new Error(`Supabase webhook claim failed: ${await res.text()}`);
  const stateResponse = await fetch(
    `${base}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(event.id)}&select=event_id,processed_at,feishu_notified_at,feishu_revenue_recorded_at,welcome_email_sent_at`,
    { headers: supabaseHeaders(env) }
  );
  if (!stateResponse.ok) throw new Error(`Supabase webhook state failed: ${await stateResponse.text()}`);
  const rows = await stateResponse.json();
  return rows[0] || {};
}

async function markWebhookEvent(env, eventId, patch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`Supabase webhook update failed: ${await res.text()}`);
}

async function completeWebhookEvent(env, eventId) {
  await markWebhookEvent(env, eventId, {
    processed_at: new Date().toISOString(),
    last_error: null
  });
}

async function recordWebhookError(env, eventId, error) {
  if (!eventId) return;
  try {
    await markWebhookEvent(env, eventId, {
      processed_at: null,
      last_error: String(error?.message || error || 'unknown_error').slice(0, 800)
    });
  } catch (markError) {
    console.error(JSON.stringify({ event: 'stripe_webhook_error_record_failed', reason: markError.message }));
  }
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

async function upsertPaidCustomerAttribution(env, event, row) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !row.stripe_checkout_session_id) {
    return { skipped: true };
  }
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const paidAt = new Date(Number(event.created || 0) * 1000 || Date.now()).toISOString();
  const skillEmail = row.plan === SKILL_EMAIL_PLAN;
  const automation = automationForPlan(skillEmail ? SKILL_EMAIL_PLAN : ANNUAL_MEMBER_PLAN);
  const response = await fetch(`${base}/rest/v1/customer_attributions?on_conflict=order_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      customer_key: `order:${row.stripe_checkout_session_id}`,
      customer_name: row.customer_name,
      email: row.email,
      rule_key: automation.ruleKey,
      source_channel: automation.sourceChannel,
      customer_type: automation.customerType,
      stage: 'paid',
      tag_names: [...automation.tagNames],
      order_id: row.stripe_checkout_session_id,
      amount_total: row.amount_total,
      currency: row.currency,
      first_touch_at: paidAt,
      paid_at: paidAt,
      last_event: '支付成功',
      last_error: null,
      feishu_synced_at: null,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`customer_attribution_upsert_failed:${await response.text()}`);
  return { ok: true };
}

async function getFeishuTenantToken(env) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) return null;
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`feishu_token_failed:${data.code || response.status}`);
  }
  return data.tenant_access_token;
}

function paymentAmount(amount, currency) {
  const value = Number(amount || 0) / 100;
  if (String(currency).toLowerCase() === 'cny') return `¥${value.toFixed(value % 1 ? 2 : 0)}`;
  return `${String(currency || '').toUpperCase()} ${value.toFixed(2)}`.trim();
}

function shanghaiTime(value) {
  if (!value) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function revenueOrderId(event, row) {
  return row.stripe_checkout_session_id || row.stripe_payment_intent_id || event.id;
}

function revenueProduct(row) {
  if (row.plan === SKILL_EMAIL_PLAN) return 'Tech Bridge 技能邮件订阅';
  return row.plan === ANNUAL_MEMBER_PLAN ? 'Tech Bridge 年度会员' : row.plan || 'Tech Bridge 数字服务';
}

function toFeishuRevenueFields(event, row) {
  const currency = String(row.currency || '').toLowerCase();
  const orderId = revenueOrderId(event, row);
  const eventTime = Number(event.created || 0) * 1000 || Date.now();
  const amount = Number(row.amount_total || 0) / 100;
  const currencyCode = currency.toUpperCase();
  const supportedCurrencies = new Set(['CNY', 'HKD', 'USD', 'EUR']);
  const currencyOption = supportedCurrencies.has(currencyCode) ? currencyCode : '其他';
  const paymentReference = row.stripe_payment_intent_id
    ? `Stripe payment_intent ${row.stripe_payment_intent_id}`
    : 'Stripe checkout.session.completed';
  const conversionNote = currency === 'cny' ? '' : `；${currencyCode || '未知币种'} 待折算人民币`;

  return {
    '收入事项': `${revenueProduct(row)}收入`,
    '收入日期': eventTime,
    '原币金额': amount,
    '币种': currencyOption,
    ...(currency === 'cny' ? { '收入金额': amount } : {}),
    '收款渠道': 'Stripe',
    '来源渠道': 'Tech Bridge 官网',
    '收入类型': row.plan === SKILL_EMAIL_PLAN ? '内容订阅' : '会员订阅',
    '产品/服务': revenueProduct(row),
    '客户/付款人': row.customer_name || row.email || '未知',
    '支付状态': '已支付',
    '订单号': orderId,
    '备注': `${paymentReference}；事件 ${event.id}${conversionNote}`
  };
}

async function recordFeishuRevenue(env, event, row) {
  if (!env.FEISHU_REVENUE_BASE_TOKEN || !env.FEISHU_REVENUE_TABLE_ID) {
    console.error(JSON.stringify({
      event: 'feishu_revenue_skipped',
      reason: 'missing_feishu_revenue_config',
      stripeEventId: event.id
    }));
    return { skipped: true };
  }

  const tenantToken = await getFeishuTenantToken(env);
  const baseToken = encodeURIComponent(env.FEISHU_REVENUE_BASE_TOKEN);
  const tableId = encodeURIComponent(env.FEISHU_REVENUE_TABLE_ID);
  const orderId = revenueOrderId(event, row);
  const endpoint = `https://open.feishu.cn/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records`;
  const headers = {
    authorization: `Bearer ${tenantToken}`,
    'content-type': 'application/json; charset=utf-8'
  };

  const searchResponse = await fetch(`${endpoint}/search?page_size=1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      field_names: ['订单号'],
      filter: {
        conjunction: 'and',
        conditions: [{ field_name: '订单号', operator: 'is', value: [orderId] }]
      }
    })
  });
  const searchData = await searchResponse.json().catch(() => ({}));
  if (!searchResponse.ok || searchData.code !== 0) {
    throw new Error(`feishu_revenue_search_failed:${searchData.code || searchResponse.status}:${String(searchData.msg || '').slice(0, 160)}`);
  }

  const existingRecord = searchData.data?.items?.[0];
  if (existingRecord?.record_id) {
    return { ok: true, duplicate: true, recordId: existingRecord.record_id };
  }

  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields: toFeishuRevenueFields(event, row) })
  });
  const createData = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || createData.code !== 0) {
    throw new Error(`feishu_revenue_write_failed:${createData.code || createResponse.status}:${String(createData.msg || '').slice(0, 160)}`);
  }

  return { ok: true, duplicate: false, recordId: createData.data?.record?.record_id };
}

async function sendFeishuPaymentNotification(env, event, row) {
  if (!env.FEISHU_NOTIFY_OPEN_ID || !env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    console.error(JSON.stringify({ event: 'payment_notification_skipped', reason: 'missing_feishu_config', stripeEventId: event.id }));
    return { skipped: true };
  }

  const tenantToken = await getFeishuTenantToken(env);
  const lines = [
    '【Tech Bridge 官网新成交】',
    '',
    `成交金额：${paymentAmount(row.amount_total, row.currency)}`,
    `商品：${revenueProduct(row)}`,
    `付款用户：${row.customer_name || row.email || '未知'}`,
    `付款邮箱：${row.email || '未知'}`,
    `成交时间：${shanghaiTime((event.created || 0) * 1000)}`,
    `${row.plan === SKILL_EMAIL_PLAN ? '订阅有效期' : '会员有效期'}：${shanghaiTime(row.current_period_end)}`
  ];
  if (row.stripe_payment_intent_id) {
    lines.push('', `Stripe 订单：https://dashboard.stripe.com/payments/${row.stripe_payment_intent_id}`);
  }
  if (env.FEISHU_REVENUE_BASE_URL) {
    lines.push(`收入台账：${env.FEISHU_REVENUE_BASE_URL}`);
  }

  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tenantToken}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      receive_id: env.FEISHU_NOTIFY_OPEN_ID,
      msg_type: 'text',
      content: JSON.stringify({ text: lines.join('\n') }),
      uuid: event.id.slice(0, 50)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    throw new Error(`feishu_payment_notification_failed:${data.code || response.status}:${String(data.msg || '').slice(0, 160)}`);
  }
  return { ok: true };
}

async function sendWelcomeEmail(env, row, eventId) {
  if (!env.RESEND_API_KEY || !row.email || row.status !== 'active') {
    return { skipped: true };
  }

  const from = env.RESEND_FROM || 'Tech Bridge <newsletter@qiaobit.com>';
  const skillEmail = row.plan === SKILL_EMAIL_PLAN;
  const subject = skillEmail ? '欢迎订阅 Tech Bridge 技能邮件' : '欢迎加入 Tech Bridge 会员信';
  const html = `
    <div style="font-family:Arial,'Noto Sans SC',sans-serif;line-height:1.8;color:#1A1A18">
      <h2>${skillEmail ? '欢迎订阅 Tech Bridge 技能邮件' : '欢迎加入 Tech Bridge 会员信'}</h2>
      <p>你的${skillEmail ? '技能邮件订阅' : '会员订阅'}已开通。后续我会把 AI 产品实战、内容增长复盘、可复用工作流和项目经验发到这个邮箱。</p>
      ${skillEmail ? '<p>本次为一次性支付，有效期 365 天，不会自动续费。计划每月发送 2 封，重大项目节点会不定期加更。</p><p><a href="https://qiaobit.com/?sample=skill-letter#member-subscribe" style="color:#008C8C">查看技能邮件样刊结构</a></p>' : ''}
      <p>如果你需要更换邮箱或取消订阅，直接回复这封邮件即可。</p>
      <p style="color:#8A8580">Tech Bridge / 桥比特</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': `stripe-${eventId}-welcome`
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
    customer_name: session.customer_details?.name || null,
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
    customer_name: null,
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
    const eventState = await claimWebhookEvent(env, event);

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
        await upsertPaidCustomerAttribution(env, event, row);
        if (!eventState.feishu_revenue_recorded_at) {
          const revenue = await recordFeishuRevenue(env, event, row);
          if (revenue.ok) {
            await markWebhookEvent(env, event.id, { feishu_revenue_recorded_at: new Date().toISOString() });
          }
        }
        if (!eventState.feishu_notified_at) {
          const notified = await sendFeishuPaymentNotification(env, event, row);
          if (notified.ok) {
            await markWebhookEvent(env, event.id, { feishu_notified_at: new Date().toISOString() });
          }
        }
        if (!eventState.welcome_email_sent_at) {
          const emailed = await sendWelcomeEmail(env, row, event.id);
          if (emailed.ok) {
            await markWebhookEvent(env, event.id, { welcome_email_sent_at: new Date().toISOString() });
          }
        }
      }
    }

    await completeWebhookEvent(env, event.id);
    return json({ received: true });
  } catch (error) {
    await recordWebhookError(env, event?.id, error);
    return json({ error: 'webhook_processing_failed', message: error.message }, 500);
  }
}
