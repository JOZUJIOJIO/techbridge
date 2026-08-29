import { createDecipheriv, createPublicKey, verify as verifyRsaSignature, X509Certificate } from 'node:crypto';

const SUCCESS_EVENT = 'TRANSACTION.SUCCESS';
const MAX_CALLBACK_AGE_MS = 5 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function requireConfig(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_wechatpay_config:${missing.join(',')}`);
}

function paymentAmount(amount) {
  const value = Number(amount?.total || 0) / 100;
  return `¥${value.toFixed(value % 1 ? 2 : 0)}`;
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

function callbackMessage(timestamp, nonce, body) {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

function callbackTimeMillis(timestamp) {
  if (/^\d{10,13}$/.test(String(timestamp))) {
    const numeric = Number(timestamp);
    return String(timestamp).length === 10 ? numeric * 1000 : numeric;
  }
  return Date.parse(timestamp);
}

function platformPublicKey(pem) {
  return pem.includes('BEGIN CERTIFICATE')
    ? new X509Certificate(pem).publicKey
    : createPublicKey(pem);
}

export function verifyWechatPaySignature({ body, signature, timestamp, nonce, platformCertificate }) {
  if (!body || !signature || !timestamp || !nonce || !platformCertificate) return false;
  const receivedAt = callbackTimeMillis(timestamp);
  if (!Number.isFinite(receivedAt) || Math.abs(Date.now() - receivedAt) > MAX_CALLBACK_AGE_MS) return false;

  try {
    return verifyRsaSignature(
      'RSA-SHA256',
      Buffer.from(callbackMessage(timestamp, nonce, body)),
      platformPublicKey(platformCertificate),
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

export function decryptWechatPayResource(resource, apiV3Key) {
  if (!resource?.ciphertext || !resource?.nonce || !apiV3Key) {
    throw new Error('invalid_wechatpay_resource');
  }
  const encrypted = Buffer.from(resource.ciphertext, 'base64');
  if (encrypted.length <= 16) throw new Error('invalid_wechatpay_ciphertext');

  const ciphertext = encrypted.subarray(0, -16);
  const authTag = encrypted.subarray(-16);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(resource.nonce, 'utf8'));
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  decipher.setAuthTag(authTag);

  try {
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('wechatpay_resource_decrypt_failed');
  }
}

function supabaseHeaders(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

function journalEndpoint(env) {
  return `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/wechatpay_webhook_events`;
}

async function claimTransaction(env, notification, transaction) {
  requireConfig(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const endpoint = journalEndpoint(env);
  const transactionId = String(transaction.transaction_id || '');
  if (!transactionId) throw new Error('missing_wechatpay_transaction_id');

  const createResponse = await fetch(`${endpoint}?on_conflict=transaction_id`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({
      transaction_id: transactionId,
      notification_id: String(notification.id || transactionId),
      event_type: String(notification.event_type || SUCCESS_EVENT),
      transaction
    })
  });
  if (!createResponse.ok) throw new Error(`wechatpay_journal_claim_failed:${createResponse.status}`);
  const createdRows = await createResponse.json().catch(() => []);

  const stateResponse = await fetch(
    `${endpoint}?transaction_id=eq.${encodeURIComponent(transactionId)}&select=transaction_id,transaction,processed_at,feishu_revenue_recorded_at,feishu_notified_at`,
    { headers: supabaseHeaders(env) }
  );
  if (!stateResponse.ok) throw new Error(`wechatpay_journal_state_failed:${stateResponse.status}`);
  const rows = await stateResponse.json();
  if (!rows[0]) throw new Error('wechatpay_journal_state_missing');
  return { ...rows[0], claimed: Array.isArray(createdRows) && createdRows.length > 0 };
}

async function markTransaction(env, transactionId, patch) {
  const response = await fetch(`${journalEndpoint(env)}?transaction_id=eq.${encodeURIComponent(transactionId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`wechatpay_journal_update_failed:${response.status}`);
}

async function getFeishuTenantToken(env) {
  requireConfig(env, ['FEISHU_APP_ID', 'FEISHU_APP_SECRET']);
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

function revenueFields(transaction, merchantId) {
  const currency = String(transaction.amount?.currency || 'CNY').toUpperCase();
  const amount = Number(transaction.amount?.total || 0) / 100;
  const paidAt = Date.parse(transaction.success_time || '') || Date.now();
  const product = String(transaction.description || '硅基物语微信收款');
  const merchantOrderNo = String(transaction.out_trade_no || '未提供');

  return {
    '收入事项': `${product}收入`,
    '收入日期': paidAt,
    '原币金额': amount,
    '币种': ['CNY', 'HKD', 'USD', 'EUR'].includes(currency) ? currency : '其他',
    ...(currency === 'CNY' ? { '收入金额': amount } : {}),
    '收款渠道': '微信支付',
    '来源渠道': '企业微信收款',
    '收入类型': '其他',
    '产品/服务': product,
    '客户/付款人': '微信支付用户',
    '支付状态': '已支付',
    '订单号': transaction.transaction_id,
    '备注': `硅基物语；商户号 ${merchantId}；商户订单号 ${merchantOrderNo}；微信支付交易号 ${transaction.transaction_id}`
  };
}

async function recordFeishuRevenue(env, transaction) {
  requireConfig(env, ['FEISHU_REVENUE_BASE_TOKEN', 'FEISHU_REVENUE_TABLE_ID']);
  const token = await getFeishuTenantToken(env);
  const endpoint = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(env.FEISHU_REVENUE_BASE_TOKEN)}/tables/${encodeURIComponent(env.FEISHU_REVENUE_TABLE_ID)}/records`;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json; charset=utf-8'
  };
  const transactionId = String(transaction.transaction_id);
  const searchResponse = await fetch(`${endpoint}/search?page_size=1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      field_names: ['订单号'],
      filter: {
        conjunction: 'and',
        conditions: [{ field_name: '订单号', operator: 'is', value: [transactionId] }]
      }
    })
  });
  const searchData = await searchResponse.json().catch(() => ({}));
  if (!searchResponse.ok || searchData.code !== 0) {
    throw new Error(`feishu_revenue_search_failed:${searchData.code || searchResponse.status}`);
  }
  const existing = searchData.data?.items?.[0];
  if (existing?.record_id) return { duplicate: true, recordId: existing.record_id };

  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields: revenueFields(transaction, env.WECHATPAY_MCHID) })
  });
  const createData = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || createData.code !== 0) {
    throw new Error(`feishu_revenue_write_failed:${createData.code || createResponse.status}`);
  }
  return { duplicate: false, recordId: createData.data?.record?.record_id };
}

async function sendFeishuNotification(env, transaction) {
  requireConfig(env, ['FEISHU_NOTIFY_OPEN_ID']);
  const token = await getFeishuTenantToken(env);
  const lines = [
    '【硅基物语企业微信收款】',
    '',
    `成交金额：${paymentAmount(transaction.amount)}`,
    `商品：${transaction.description || '未填写'}`,
    '付款用户：微信支付用户',
    `成交时间：${shanghaiTime(transaction.success_time)}`,
    `微信支付交易号：${transaction.transaction_id}`,
    `商户订单号：${transaction.out_trade_no || '未提供'}`
  ];
  if (env.FEISHU_REVENUE_BASE_URL) lines.push('', `收入台账：${env.FEISHU_REVENUE_BASE_URL}`);

  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      receive_id: env.FEISHU_NOTIFY_OPEN_ID,
      msg_type: 'text',
      content: JSON.stringify({ text: lines.join('\n') }),
      uuid: `wechatpay-${String(transaction.transaction_id).slice(0, 36)}`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    throw new Error(`feishu_payment_notification_failed:${data.code || response.status}`);
  }
}

async function processTransaction(env, state) {
  const transaction = state.transaction;
  const transactionId = String(state.transaction_id || transaction?.transaction_id || '');
  if (!transactionId || !transaction) throw new Error('invalid_wechatpay_journal_state');
  if (state.processed_at) return { skipped: true };

  try {
    if (!state.feishu_revenue_recorded_at) {
      const revenue = await recordFeishuRevenue(env, transaction);
      await markTransaction(env, transactionId, { feishu_revenue_recorded_at: new Date().toISOString() });
      if (revenue.duplicate) {
        await markTransaction(env, transactionId, {
          feishu_notified_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          processing_started_at: null,
          last_error: null
        });
        return { duplicate: true };
      }
    }
    if (!state.feishu_notified_at) {
      await sendFeishuNotification(env, transaction);
      await markTransaction(env, transactionId, { feishu_notified_at: new Date().toISOString() });
    }
    await markTransaction(env, transactionId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null
    });
    return { ok: true };
  } catch (error) {
    await markTransaction(env, transactionId, {
      processing_started_at: null,
      last_error: String(error?.message || error || 'unknown_error').slice(0, 800)
    });
    throw error;
  }
}

export async function runWechatPayReconcile(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const response = await fetch(
    `${journalEndpoint(env)}?processed_at=is.null&order=received_at.asc&limit=20&select=transaction_id,transaction,processed_at,processing_started_at,feishu_revenue_recorded_at,feishu_notified_at`,
    { headers: supabaseHeaders(env) }
  );
  if (!response.ok) throw new Error(`wechatpay_reconcile_list_failed:${response.status}`);
  const rows = await response.json();
  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const startedAt = Date.parse(row.processing_started_at || '');
    if (Number.isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000) continue;
    try {
      await markTransaction(env, row.transaction_id, { processing_started_at: new Date().toISOString() });
      await processTransaction(env, row);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ event: 'wechatpay_reconcile_failed', transactionId: row.transaction_id, reason: error.message }));
    }
  }
  return { processed, failed };
}

export async function onRequestPost({ request, env, ctx }) {
  try {
    requireConfig(env, [
      'WECHATPAY_MCHID',
      'WECHATPAY_API_V3_KEY',
      'WECHATPAY_PLATFORM_CERT_PEM',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ]);
  } catch (error) {
    return json({ error: 'missing_config', message: error.message }, 503);
  }

  const body = await request.text();
  const valid = verifyWechatPaySignature({
    body,
    signature: request.headers.get('wechatpay-signature'),
    timestamp: request.headers.get('wechatpay-timestamp'),
    nonce: request.headers.get('wechatpay-nonce'),
    platformCertificate: env.WECHATPAY_PLATFORM_CERT_PEM
  });
  if (!valid) return json({ error: 'invalid_signature' }, 401);

  let notification;
  try {
    notification = JSON.parse(body);
  } catch {
    return json({ error: 'bad_payload' }, 400);
  }
  if (notification.event_type !== SUCCESS_EVENT) return new Response(null, { status: 204 });

  let transaction;
  try {
    transaction = decryptWechatPayResource(notification.resource, env.WECHATPAY_API_V3_KEY);
  } catch (error) {
    return json({ error: 'invalid_resource', message: error.message }, 400);
  }
  if (String(transaction.mchid) !== String(env.WECHATPAY_MCHID)) {
    return json({ error: 'merchant_mismatch' }, 403);
  }
  if (transaction.trade_state !== 'SUCCESS') return new Response(null, { status: 204 });

  try {
    const state = await claimTransaction(env, notification, transaction);
    if (state.claimed) {
      const task = processTransaction(env, state).catch((error) => {
        console.error(JSON.stringify({ event: 'wechatpay_background_processing_failed', transactionId: transaction.transaction_id, reason: error.message }));
      });
      if (ctx?.waitUntil) ctx.waitUntil(task);
      else await task;
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return json({ error: 'webhook_processing_failed', message: error.message }, 500);
  }
}
