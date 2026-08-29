import assert from 'node:assert/strict';
import test from 'node:test';

import { createPayoutHubTransfer, payoutHubConfigured } from '../functions/lib/payout-hub-client.js';
import { payoutHubSignature } from '../server/payout-hub/index.mjs';

test('Cloudflare client signs fixed-amount payout tasks for the independent hub', async () => {
  const env = {
    WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'true',
    PAYOUT_HUB_URL: 'https://siliconstory.cn',
    PAYOUT_HUB_API_SECRET: 'hub-secret'
  };
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url: String(url), init };
    return Response.json({ packageInfo: 'package', transferBillNo: 'wx-bill', state: 'WAIT_USER_CONFIRM' });
  };
  try {
    assert.equal(payoutHubConfigured(env), true);
    await createPayoutHubTransfer(env, { outBillNo: 'TBP20260829ABCDEF1234567890', openid: 'o12345678901234567890', amount: 20000 });
    assert.equal(call.url, 'https://siliconstory.cn/techbridge/transfer/create');
    const timestamp = call.init.headers['x-tb-timestamp'];
    assert.equal(call.init.headers['x-tb-signature'], payoutHubSignature('hub-secret', timestamp, call.init.body));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
