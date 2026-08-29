import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { runWechatProfitSharing } from '../server/payout-hub/profit-sharing-jobs.mjs';
import {
  addProfitSharingReceiver,
  createProfitSharingOrder,
  profitSharingOrderNumber,
  queryProfitSharingOrder
} from '../server/payout-hub/wechat-profit-sharing.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  WXPAY_PROFIT_SHARING_ENABLED: 'true',
  WXPAY_MCHID: '1111987017',
  WXPAY_CERT_SERIAL: 'CERT123',
  WXPAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  WXPAY_TRANSFER_APPID: 'wxaab68c7822881159'
};
const openid = 'o12345678901234567890';
const transactionId = '4200000000202608290000000001';

test('uses official profit-sharing APIs for a personal distributor receiver and CNY 199.80', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/receivers/add')) return Response.json({ type: 'PERSONAL_OPENID', account: openid });
    if (init.method === 'POST') return Response.json({ state: 'PROCESSING', order_id: 'profit-order-id', receivers: [] });
    return Response.json({ state: 'FINISHED', order_id: 'profit-order-id', receivers: [{ type: 'PERSONAL_OPENID', account: openid, amount: 19980, result: 'SUCCESS' }] });
  };
  await addProfitSharingReceiver(env, openid, fetchFn);
  const outOrderNo = profitSharingOrderNumber('12345678-1234-4234-8234-123456789012');
  await createProfitSharingOrder(env, { transactionId, outOrderNo, openid, amount: 19980 }, fetchFn);
  await queryProfitSharingOrder(env, { transactionId, outOrderNo }, fetchFn);

  const receiverBody = JSON.parse(calls[0].init.body);
  assert.equal(receiverBody.type, 'PERSONAL_OPENID');
  assert.equal(receiverBody.relation_type, 'DISTRIBUTOR');
  const orderBody = JSON.parse(calls[1].init.body);
  assert.equal(orderBody.receivers[0].amount, 19980);
  assert.equal(orderBody.unfreeze_unsplit, true);
  assert.match(calls[2].url, /\/v3\/profitsharing\/orders\/TBPS/);
  assert.match(calls[2].url, /transaction_id=4200000000202608290000000001/);
  assert.match(calls[0].init.headers.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
});

test('profit-sharing scheduler registers the receiver and starts the exact attributed commission', async () => {
  const calls = [];
  const schedulerEnv = {
    ...env,
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role'
  };
  const commissionId = '12345678-1234-4234-8234-123456789012';
  const fetchFn = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_order_commissions?') && !init.method) return Response.json([{
      id: commissionId,
      order_reference: 'order-id',
      commission_amount: 19980,
      status: 'pending',
      transfer_id: null,
      profit_sharing_order_no: null,
      distribution_partners: {
        id: 'partner-id', status: 'active', wechat_openid: openid,
        wechat_appid: 'wxaab68c7822881159', profit_sharing_receiver_status: 'pending'
      }
    }]);
    if (href.includes('/skill_store_orders?')) return Response.json([{
      id: 'order-id', status: 'paid', wechat_transaction_id: transactionId, paid_at: '2026-08-29T00:00:00Z'
    }]);
    if (href === 'https://api.mch.weixin.qq.com/v3/profitsharing/receivers/add') {
      return Response.json({ type: 'PERSONAL_OPENID', account: openid });
    }
    if (href === 'https://api.mch.weixin.qq.com/v3/profitsharing/orders') {
      return Response.json({ state: 'PROCESSING', order_id: 'profit-order-id', receivers: [{ type: 'PERSONAL_OPENID', account: openid, result: 'PENDING' }] });
    }
    if (init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${href}`);
  };

  const result = await runWechatProfitSharing(schedulerEnv, fetchFn);
  assert.equal(result.processed, 1);
  assert.equal(result.results[0].state, 'processing');
  const partnerPatch = calls.find(({ href, init }) => href.includes('/distribution_partners?') && init.method === 'PATCH');
  assert.equal(JSON.parse(partnerPatch.init.body).profit_sharing_receiver_status, 'ready');
  const commissionPatches = calls.filter(({ href, init }) => href.includes('/partner_order_commissions?') && init.method === 'PATCH');
  assert.ok(commissionPatches.some(({ init }) => JSON.parse(init.body).status === 'transferring'));
  assert.ok(commissionPatches.some(({ init }) => JSON.parse(init.body).profit_sharing_order_no?.startsWith('TBPS')));
});

test('profit-sharing scheduler stays inert until the merchant product is enabled', async () => {
  const result = await runWechatProfitSharing({ ...env, WXPAY_PROFIT_SHARING_ENABLED: 'false' }, async () => {
    throw new Error('network must not be touched');
  });
  assert.deepEqual(result, { skipped: true, reason: 'profit_sharing_disabled' });
});
