import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

import { runWechatPartnerPayoutReconcile } from '../functions/partner-withdrawals.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function env(extra = {}) {
  return {
    WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'true',
    WECHATPAY_MCHID: '1900000109',
    WECHATPAY_MERCHANT_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WECHATPAY_MERCHANT_CERT_SERIAL: 'SERIAL123',
    WECHATPAY_TRANSFER_APP_ID: 'wx_test_skill_letter',
    WECHATPAY_TRANSFER_SCENE_ID: '1005',
    WECHATPAY_TRANSFER_NOTIFY_URL: 'https://qiaobit.com/api/wechatpay-transfer-webhook',
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    ...extra
  };
}

test('scheduled reconciliation completes a transfer when WeChat reports success', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_payout_requests?')) {
      return Response.json([{ id: 'request-id', out_bill_no: 'TBP20260829ABCDEF1234567890', status: 'processing' }]);
    }
    if (href.includes('api.mch.weixin.qq.com/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/')) {
      return Response.json({
        out_bill_no: 'TBP20260829ABCDEF1234567890',
        transfer_bill_no: 'wx-transfer-id',
        state: 'SUCCESS'
      });
    }
    if (href.endsWith('/rest/v1/rpc/complete_partner_payout_request')) return Response.json({ status: 'success' });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const result = await runWechatPartnerPayoutReconcile(env());
    assert.equal(result.results[0].state, 'SUCCESS');
    const completion = calls.find(({ href }) => href.endsWith('/rpc/complete_partner_payout_request'));
    assert.ok(completion);
    assert.deepEqual(JSON.parse(completion.init.body), {
      p_out_bill_no: 'TBP20260829ABCDEF1234567890',
      p_external_transfer_id: 'wx-transfer-id'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('scheduled reconciliation is inert while the transfer switch is disabled', async () => {
  const result = await runWechatPartnerPayoutReconcile(env({ WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'false' }));
  assert.equal(result.skipped, true);
});
