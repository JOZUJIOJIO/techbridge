import assert from 'node:assert/strict';
import { createCipheriv, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { decryptWechatPayResource, onRequestPost, verifyWechatPaySignature } from '../functions/api/wechatpay-webhook.js';

const API_V3_KEY = '0123456789abcdef0123456789abcdef';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PLATFORM_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });

function transaction() {
  return {
    mchid: '1747209687',
    transaction_id: '42000000002026072500000001',
    out_trade_no: 'silicon-story-test-001',
    trade_state: 'SUCCESS',
    success_time: '2026-07-25T16:00:00+08:00',
    description: '硅基物语测试收款',
    amount: { total: 1, currency: 'CNY' }
  };
}

function encryptTransaction(value) {
  const nonce = '0123456789ab';
  const associatedData = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(API_V3_KEY), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  return {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
      cipher.getAuthTag()
    ]).toString('base64'),
    associated_data: associatedData,
    nonce
  };
}

function signedRequest(overrides = {}) {
  const payload = {
    id: 'EV-202607250001',
    event_type: 'TRANSACTION.SUCCESS',
    resource: encryptTransaction(transaction()),
    ...overrides
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = 'callback-nonce';
  const signature = sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), privateKey).toString('base64');
  return new Request('https://qiaobit.com/api/wechatpay-webhook', {
    method: 'POST',
    headers: {
      'wechatpay-signature': signature,
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce
    },
    body
  });
}

function testEnv() {
  return {
    WECHATPAY_MCHID: '1747209687',
    WECHATPAY_API_V3_KEY: API_V3_KEY,
    WECHATPAY_PLATFORM_CERT_PEM: PLATFORM_PUBLIC_KEY,
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'app-secret',
    FEISHU_REVENUE_BASE_TOKEN: 'base-token',
    FEISHU_REVENUE_TABLE_ID: 'table-id',
    FEISHU_NOTIFY_OPEN_ID: 'ou_notify'
  };
}

function mockFetch({ existingTransaction = false } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/wechatpay_webhook_events?on_conflict=')) {
      return Response.json(existingTransaction ? [] : [{ transaction_id: transaction().transaction_id }], { status: 201 });
    }
    if (href.includes('/wechatpay_webhook_events?transaction_id=')) {
      if (init.method === 'PATCH') return new Response(null, { status: 204 });
      return Response.json([{
        transaction_id: transaction().transaction_id,
        transaction: transaction(),
        processed_at: null,
        processing_started_at: new Date().toISOString(),
        feishu_revenue_recorded_at: null,
        feishu_notified_at: null
      }]);
    }
    if (href.includes('/auth/v3/tenant_access_token/internal')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token' });
    }
    if (href.endsWith('/records/search?page_size=1')) return Response.json({ code: 0, data: { items: [] } });
    if (href.endsWith('/records')) return Response.json({ code: 0, data: { record: { record_id: 'rec_created' } } });
    if (href.includes('/open-apis/im/v1/messages')) return Response.json({ code: 0, data: {} });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('verifies a signed callback and decrypts its transaction payload', async () => {
  const request = signedRequest();
  const body = await request.clone().text();
  assert.equal(verifyWechatPaySignature({
    body,
    signature: request.headers.get('wechatpay-signature'),
    timestamp: request.headers.get('wechatpay-timestamp'),
    nonce: request.headers.get('wechatpay-nonce'),
    platformCertificate: PLATFORM_PUBLIC_KEY
  }), true);
  assert.deepEqual(decryptWechatPayResource(encryptTransaction(transaction()), API_V3_KEY), transaction());
});

test('records a verified 硅基物语 payment into Feishu and sends one notification', async () => {
  const mock = mockFetch();
  try {
    const response = await onRequestPost({
      request: signedRequest(),
      env: testEnv(),
      ctx: { waitUntil: (promise) => promise }
    });
    assert.equal(response.status, 204);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const createCall = mock.calls.find(({ href, init }) => href.endsWith('/records') && init.method === 'POST');
    assert.ok(createCall);
    const fields = JSON.parse(createCall.init.body).fields;
    assert.equal(fields['收款渠道'], '微信支付');
    assert.equal(fields['来源渠道'], '企业微信收款');
    assert.equal(fields['订单号'], transaction().transaction_id);
    assert.equal(fields['收入金额'], 0.01);
    assert.equal(fields['支付状态'], '已支付');
    assert.equal(mock.calls.filter(({ href }) => href.includes('/open-apis/im/v1/messages')).length, 1);
  } finally {
    mock.restore();
  }
});

test('rejects a callback whose decrypted merchant number does not match', async () => {
  const mock = mockFetch();
  try {
    const wrong = { ...transaction(), mchid: '1900000000' };
    const response = await onRequestPost({
      request: signedRequest({ resource: encryptTransaction(wrong) }),
      env: testEnv(),
      ctx: { waitUntil: (promise) => promise }
    });
    assert.equal(response.status, 403);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test('does not process a duplicate transaction while its first callback is still running', async () => {
  const mock = mockFetch({ existingTransaction: true });
  try {
    const response = await onRequestPost({
      request: signedRequest(),
      env: testEnv(),
      ctx: { waitUntil: (promise) => promise }
    });
    assert.equal(response.status, 204);
    assert.equal(mock.calls.filter(({ href }) => href.endsWith('/records')).length, 0);
    assert.equal(mock.calls.filter(({ href }) => href.includes('/open-apis/im/v1/messages')).length, 0);
  } finally {
    mock.restore();
  }
});
