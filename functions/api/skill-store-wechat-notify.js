import { decryptWechatPayResource, verifyWechatPaySignature } from './wechatpay-webhook.js';
import {
  skillStoreDeliveryToken,
  skillStoreSupabaseBase,
  skillStoreSupabaseHeaders
} from '../lib/skill-store.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function orderByNumber(env, orderNumber) {
  const params = new URLSearchParams({
    order_number: `eq.${orderNumber}`,
    select: 'id,order_number,product_id,partner_id,buyer_email,gross_amount,currency,status,paid_at,delivered_at,delivery_status',
    limit: '1'
  });
  const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders?${params}`, {
    headers: skillStoreSupabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`skill_store_order_read_failed:${response.status}`);
  return (await response.json())[0] || null;
}

async function completeOrder(env, orderNumber, transactionId, paidAt) {
  const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/rpc/complete_skill_store_order`, {
    method: 'POST',
    headers: skillStoreSupabaseHeaders(env),
    body: JSON.stringify({
      p_order_number: orderNumber,
      p_transaction_id: transactionId,
      p_paid_at: paidAt
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`skill_store_order_complete_failed:${data.message || response.status}`);
  return data;
}

async function claimDelivery(env, orderId) {
  const now = new Date().toISOString();
  const response = await fetch(
    `${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders?id=eq.${encodeURIComponent(orderId)}&delivery_status=in.(pending,failed)`,
    {
      method: 'PATCH',
      headers: skillStoreSupabaseHeaders(env, 'return=representation'),
      body: JSON.stringify({ delivery_status: 'sending', delivery_attempted_at: now, last_error: null, updated_at: now })
    }
  );
  if (!response.ok) throw new Error(`skill_store_delivery_claim_failed:${response.status}`);
  return Boolean((await response.json())[0]);
}

async function markDelivery(env, orderId, status, error) {
  const now = new Date().toISOString();
  const response = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: skillStoreSupabaseHeaders(env),
    body: JSON.stringify({
      delivery_status: status,
      delivered_at: status === 'sent' ? now : null,
      last_error: error ? String(error).slice(0, 500) : null,
      updated_at: now
    })
  });
  if (!response.ok) throw new Error(`skill_store_delivery_update_failed:${response.status}`);
}

async function resendSegment(env) {
  if (env.RESEND_SKILL_LETTER_SEGMENT_ID) return env.RESEND_SKILL_LETTER_SEGMENT_ID;
  if (!env.RESEND_API_KEY) return '';
  const response = await fetch('https://api.resend.com/segments?limit=100', {
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }
  });
  if (!response.ok) return '';
  const data = await response.json();
  return data.data?.find((segment) => segment.name === 'Tech Bridge AI Skills Active')?.id || '';
}

async function syncResend(env, email) {
  if (!env.RESEND_API_KEY || env.RESEND_AUDIENCE_SYNC_ENABLED !== 'true') return;
  const segmentId = await resendSegment(env);
  const response = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false, segments: segmentId ? [{ id: segmentId }] : [] })
  });
  if (!response.ok && response.status !== 409) throw new Error(`skill_store_resend_contact_failed:${response.status}`);
  if (segmentId && response.status === 409) {
    const add = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`, {
      method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }
    });
    if (!add.ok && add.status !== 409) throw new Error(`skill_store_resend_segment_failed:${add.status}`);
  }
}

function downloadUrl(env, orderId) {
  if (!env.SKILL_PACK_DOWNLOAD_SECRET) return '';
  const site = String(env.PUBLIC_SITE_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
  const token = skillStoreDeliveryToken(env.SKILL_PACK_DOWNLOAD_SECRET, orderId);
  return `${site}/api/skill-store/download?order=${encodeURIComponent(orderId)}&token=${token}`;
}

async function sendIssue001(env, order, transactionId) {
  if (!env.RESEND_API_KEY) throw new Error('skill_store_resend_not_configured');
  const link = downloadUrl(env, order.id);
  if (!link) throw new Error('skill_store_download_not_configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': `wechat-${transactionId}-issue-001`
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'AI Skills <newsletter@siliconstory.cn>',
      to: [order.buyer_email],
      subject: 'AI Skills 001｜把 Agent 从会聊天升级成会交付',
      html: `
        <div style="margin:0;background:#151513;padding:36px 18px;font-family:Arial,'Noto Sans SC',sans-serif;color:#f5f1eb;line-height:1.8">
          <div style="max-width:720px;margin:0 auto;border:1px solid #3d3a35;background:#1c1c1a">
            <div style="padding:22px 28px;border-bottom:1px solid #3d3a35;color:#ef6a2c;font:12px monospace">AI SKILLS · ANNUAL BUYER SERVICE</div>
            <div style="padding:36px 28px">
              <p style="margin:0 0 10px;color:#28b8b1;font:12px monospace">ISSUE 001 · WECHAT PAYMENT CONFIRMED</p>
              <h1 style="margin:0 0 18px;font-size:30px;line-height:1.25">把 Agent 从「会聊天」升级成「会交付」</h1>
              <p style="margin:0 0 22px;color:#b6afa6">你的 365 天 AI Skills 买手服务已开通。第一期包含 8 个精选 Skills、3 套组合工作流、45 分钟安装顺序和 7 天实战路线。</p>
              <p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:13px 20px;background:#ef5d21;color:#fff;text-decoration:none;font-weight:700">下载 Skill Pack 001 →</a></p>
              <p style="margin:0;color:#817b73;font-size:12px">全年至少 12 期，每期精选 5–10 个 Skills。本服务不自动续费。</p>
            </div>
          </div>
        </div>`,
      attachments: [{ path: link, filename: 'ai-skills-pack-001.zip' }],
      tags: [{ name: 'product', value: 'ai_skills' }, { name: 'issue', value: '001' }, { name: 'payment', value: 'wechatpay' }]
    })
  });
  if (!response.ok) throw new Error(`skill_store_resend_email_failed:${response.status}`);
}

async function feishuToken(env) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) return '';
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) throw new Error(`skill_store_feishu_token_failed:${data.code || response.status}`);
  return data.tenant_access_token;
}

async function recordFeishu(env, order, transaction) {
  if (!env.FEISHU_REVENUE_BASE_TOKEN || !env.FEISHU_REVENUE_TABLE_ID) return;
  const token = await feishuToken(env);
  if (!token) return;
  const endpoint = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(env.FEISHU_REVENUE_BASE_TOKEN)}/tables/${encodeURIComponent(env.FEISHU_REVENUE_TABLE_ID)}/records`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {
      '收入事项': 'AI Skills 年度买手服务收入',
      '收入日期': Date.parse(transaction.success_time || '') || Date.now(),
      '原币金额': Number(order.gross_amount) / 100,
      '币种': 'CNY',
      '收入金额': Number(order.gross_amount) / 100,
      '收款渠道': '微信支付',
      '来源渠道': order.partner_id ? 'AI产品收益中心' : 'AI Skills 独立官网',
      '收入类型': '内容订阅',
      '产品/服务': 'AI Skills 年度买手服务',
      '客户/付款人': order.buyer_email,
      '支付状态': '已支付',
      '订单号': transaction.transaction_id,
      '备注': `独立项目；商户订单号 ${order.order_number}`
    } })
  });
  if (!response.ok) throw new Error(`skill_store_feishu_revenue_failed:${response.status}`);

  if (env.FEISHU_NOTIFY_OPEN_ID) {
    const notify = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        receive_id: env.FEISHU_NOTIFY_OPEN_ID,
        msg_type: 'text',
        content: JSON.stringify({ text: `AI Skills 成交\n金额：¥${Number(order.gross_amount) / 100}\n邮箱：${order.buyer_email}\n渠道：${order.partner_id ? '渠道订单' : '自然订单'}\n订单：${order.order_number}` }),
        uuid: `skill-${transaction.transaction_id}`.slice(0, 50)
      })
    });
    if (!notify.ok) throw new Error(`skill_store_feishu_notify_failed:${notify.status}`);
  }
}

async function deliver(env, order, transaction) {
  if (!await claimDelivery(env, order.id)) return;
  try {
    await Promise.all([
      syncResend(env, order.buyer_email),
      sendIssue001(env, order, transaction.transaction_id),
      recordFeishu(env, order, transaction)
    ]);
    await markDelivery(env, order.id, 'sent');
  } catch (error) {
    await markDelivery(env, order.id, 'failed', error.message);
    throw error;
  }
}

export async function onRequestPost({ request, env, ctx }) {
  const required = ['WECHATPAY_MCHID', 'WECHATPAY_TRANSFER_APP_ID', 'WECHATPAY_API_V3_KEY', 'WECHATPAY_PLATFORM_CERT_PEM'];
  if (required.some((name) => !env[name])) return json({ error: 'missing_config' }, 503);
  const rawBody = await request.text();
  const valid = verifyWechatPaySignature({
    body: rawBody,
    signature: request.headers.get('wechatpay-signature'),
    timestamp: request.headers.get('wechatpay-timestamp'),
    nonce: request.headers.get('wechatpay-nonce'),
    platformCertificate: env.WECHATPAY_PLATFORM_CERT_PEM
  });
  if (!valid) return json({ code: 'FAIL', message: 'invalid_signature' }, 401);

  try {
    const notification = JSON.parse(rawBody);
    if (notification.event_type !== 'TRANSACTION.SUCCESS') return json({ code: 'SUCCESS', message: 'ignored' });
    const transaction = decryptWechatPayResource(notification.resource, env.WECHATPAY_API_V3_KEY);
    const orderNumber = String(transaction.out_trade_no || '');
    const transactionId = String(transaction.transaction_id || '');
    if (!/^TBS[A-Z0-9]{18,29}$/.test(orderNumber) || !transactionId) throw new Error('invalid_skill_store_transaction');
    const order = await orderByNumber(env, orderNumber);
    if (!order) throw new Error('skill_store_order_not_found');
    if (String(transaction.mchid) !== String(env.WECHATPAY_MCHID)) throw new Error('skill_store_mchid_mismatch');
    if (String(transaction.appid) !== String(env.WECHATPAY_TRANSFER_APP_ID)) throw new Error('skill_store_appid_mismatch');
    if (String(transaction.trade_state || '').toUpperCase() !== 'SUCCESS') throw new Error('skill_store_payment_not_success');
    if (Number(transaction.amount?.total) !== Number(order.gross_amount) || String(transaction.amount?.currency || '').toUpperCase() !== 'CNY') {
      throw new Error('skill_store_amount_mismatch');
    }

    await completeOrder(env, orderNumber, transactionId, transaction.success_time || new Date().toISOString());
    const paidOrder = { ...order, status: 'paid', paid_at: transaction.success_time || new Date().toISOString() };
    const delivery = deliver(env, paidOrder, transaction).catch((error) => {
      console.error(JSON.stringify({ event: 'skill_store_delivery_failed', orderNumber, reason: error.message }));
    });
    if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
    return json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'skill_store_wechat_notify_failed', reason: error.message }));
    return json({ code: 'FAIL', message: '处理失败' }, 500);
  }
}
