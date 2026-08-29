import assert from 'node:assert/strict';
import { createCipheriv, generateKeyPairSync, randomBytes, sign as rsaSign, verify as rsaVerify } from 'node:crypto';
import test from 'node:test';

import { onRequestPost as createOrder } from '../functions/api/skill-store-order.js';
import { onRequestPost as paymentNotify } from '../functions/api/skill-store-wechat-notify.js';
import { createWechatJsapiOrder } from '../server/payout-hub/wechat-jsapi.mjs';

const supabaseEnv = {
  SUPABASE_URL: 'https://supabase.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  PARTNER_REFERRAL_SECRET: 'partner-referral-secret',
  WECHAT_OAUTH_HUB_URL: 'https://skills.siliconstory.cn',
  SKILL_STORE_PAYMENTS_ENABLED: 'true',
  RESEND_API_KEY: 're_test'
};

test('creates a separate WeChat Pay order without touching the Stripe checkout endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url); calls.push({ href, init });
    if (href.includes('/distribution_products?')) {
      return Response.json([{ id: '11111111-1111-4111-8111-111111111111', slug: 'ai-skills-annual', name: 'AI Skills 年度买手服务', price_amount: 66600, currency: 'cny', default_commission_amount: 19980 }]);
    }
    if (href.includes('/distribution_partners?')) {
      return Response.json([{ id: '22222222-2222-4222-8222-222222222222', partner_code: '4827', display_name: '渠道4827', partner_tier: 'standard', commission_amount: 20000, payout_delay_days: 8, payout_method: 'wechat_balance' }]);
    }
    if (href.endsWith('/skill_store_orders') && init.method === 'POST') return Response.json([{ id: 'order-id' }], { status: 201 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const response = await createOrder({
      request: new Request('https://skills.siliconstory.cn/api/skill-store/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://skills.siliconstory.cn', 'user-agent': 'MicroMessenger' },
        body: JSON.stringify({ email: 'buyer@example.com', ref: '4827' })
      }),
      env: supabaseEnv
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.provider, 'wechatpay');
    assert.equal(result.mode, 'wechat');
    assert.match(result.orderToken, /^wpo_[A-Za-z0-9_-]{43}$/);
    assert.match(result.paymentUrl, /^https:\/\/skills\.siliconstory\.cn\/techbridge\/pay\/start\?ticket=/);
    const inserted = JSON.parse(calls.find(({ href }) => href.endsWith('/skill_store_orders')).init.body);
    assert.equal(inserted.gross_amount, 66600);
    assert.equal(inserted.partner_id, '22222222-2222-4222-8222-222222222222');
    assert.equal(inserted.payment_provider, 'wechatpay');
    assert.equal(calls.some(({ href }) => href.includes('api.stripe.com')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('creates and signs the official JSAPI prepay request for exactly CNY 666', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  let captured;
  const result = await createWechatJsapiOrder({
    WXPAY_MCHID: '1111987017',
    WXPAY_CERT_SERIAL: 'SERIAL123',
    WXPAY_PRIVATE_KEY: privatePem,
    WXPAY_TRANSFER_APPID: 'wxaab68c7822881159',
    WXPAY_PROFIT_SHARING_ENABLED: 'true',
    WXPAY_PAYMENT_NOTIFY_URL: 'https://qiaobit.com/api/skill-store/wechat-notify'
  }, {
    order_number: 'TBS123456789ABCDEFGHIJK',
    partner_id: '22222222-2222-4222-8222-222222222222',
    gross_amount: 66600,
    currency: 'cny',
    expires_at: '2026-08-29T18:30:00+08:00'
  }, 'oBuyerOpenId_12345678901234567890', async (url, init) => {
    captured = { url, init };
    return Response.json({ prepay_id: 'wxPREPAY1234567890' });
  });
  assert.equal(captured.url, 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.amount.total, 66600);
  assert.equal(body.appid, 'wxaab68c7822881159');
  assert.equal(body.mchid, '1111987017');
  assert.equal(body.payer.openid, 'oBuyerOpenId_12345678901234567890');
  assert.deepEqual(body.settle_info, { profit_sharing: true });
  assert.match(captured.init.headers.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  const signed = `${result.params.appId}\n${result.params.timeStamp}\n${result.params.nonceStr}\n${result.params.package}\n`;
  assert.equal(rsaVerify('RSA-SHA256', Buffer.from(signed), publicKey, Buffer.from(result.params.paySign, 'base64')), true);
});

test('does not freeze a natural order when no channel is attributed', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let body;
  await createWechatJsapiOrder({
    WXPAY_MCHID: '1111987017',
    WXPAY_CERT_SERIAL: 'SERIAL123',
    WXPAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WXPAY_TRANSFER_APPID: 'wxaab68c7822881159',
    WXPAY_PROFIT_SHARING_ENABLED: 'true',
    WXPAY_PAYMENT_NOTIFY_URL: 'https://skills.siliconstory.cn/api/skill-store/wechat-notify'
  }, {
    order_number: 'TBS123456789ABCDEFGHIJL',
    partner_id: null,
    gross_amount: 66600,
    currency: 'cny',
    expires_at: '2026-08-29T18:30:00+08:00'
  }, 'oBuyerOpenId_12345678901234567890', async (url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ prepay_id: 'wxPREPAY1234567891' });
  });
  assert.equal(body.settle_info, undefined);
});

function encryptedResource(transaction, apiV3Key) {
  const nonce = randomBytes(12).toString('base64url').slice(0, 12);
  const associatedData = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction)), cipher.final(), cipher.getAuthTag()]).toString('base64');
  return { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce, associated_data: associatedData };
}

test('verified WeChat callback atomically marks the independent order paid and starts delivery', async () => {
  const apiV3Key = '12345678901234567890123456789012';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const transaction = {
    appid: 'wxaab68c7822881159', mchid: '1111987017', out_trade_no: 'TBS123456789ABCDEFGHIJK',
    transaction_id: '4200000000202608290000000001', trade_state: 'SUCCESS', success_time: new Date().toISOString(),
    amount: { total: 66600, currency: 'CNY' }
  };
  const notification = JSON.stringify({ id: 'notice-id', event_type: 'TRANSACTION.SUCCESS', resource: encryptedResource(transaction, apiV3Key) });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = 'callback-nonce';
  const signature = rsaSign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${notification}\n`), privateKey).toString('base64');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url); calls.push({ href, init });
    if (href.includes('/skill_store_orders?order_number=')) return Response.json([{
      id: '33333333-3333-4333-8333-333333333333', order_number: transaction.out_trade_no,
      product_id: '11111111-1111-4111-8111-111111111111', partner_id: '22222222-2222-4222-8222-222222222222',
      buyer_email: 'buyer@example.com', gross_amount: 66600, currency: 'cny', status: 'paying',
      paid_at: null, delivered_at: null, delivery_status: 'pending'
    }]);
    if (href.endsWith('/rpc/complete_skill_store_order')) return Response.json({ id: '33333333-3333-4333-8333-333333333333', status: 'paid' });
    if (href.includes('delivery_status=in.(pending,failed)') && init.method === 'PATCH') return Response.json([{ id: '33333333-3333-4333-8333-333333333333' }]);
    if (href.includes('/skill_store_orders?id=eq.') && init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  const background = [];
  try {
    const response = await paymentNotify({
      request: new Request('https://qiaobit.com/api/skill-store/wechat-notify', {
        method: 'POST',
        headers: { 'wechatpay-signature': signature, 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce },
        body: notification
      }),
      env: {
        ...supabaseEnv,
        WECHATPAY_MCHID: '1111987017',
        WECHATPAY_TRANSFER_APP_ID: 'wxaab68c7822881159',
        WECHATPAY_API_V3_KEY: apiV3Key,
        WECHATPAY_PLATFORM_CERT_PEM: publicKey.export({ type: 'spki', format: 'pem' })
      },
      ctx: { waitUntil(promise) { background.push(promise); } }
    });
    assert.equal(response.status, 200);
    await Promise.all(background);
    const rpc = calls.find(({ href }) => href.endsWith('/rpc/complete_skill_store_order'));
    assert.ok(rpc);
    assert.equal(JSON.parse(rpc.init.body).p_transaction_id, transaction.transaction_id);
    assert.equal(calls.some(({ href }) => href.includes('/stripe')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
