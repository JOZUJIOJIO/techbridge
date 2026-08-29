import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

import { createWechatTransfer, queryOperationBalance } from '../server/payout-hub/wechat-transfer.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

test('payout hub creates only a CNY 200 commission transfer with official scene fields', async () => {
  let request;
  const fetchFn = async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ transfer_bill_no: 'wx-bill', package_info: 'wx-package', state: 'WAIT_USER_CONFIRM' });
  };
  const env = {
    WXPAY_TRANSFER_ENABLED: 'true',
    WXPAY_MCHID: '1111987017',
    WXPAY_CERT_SERIAL: 'CERT123',
    WXPAY_PRIVATE_KEY_PATH: '/unused',
    WXPAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WXPAY_TRANSFER_APPID: 'wxaab68c7822881159',
    WXPAY_TRANSFER_NOTIFY_URL: 'https://siliconstory.cn/techbridge/transfer/callback'
  };
  const result = await createWechatTransfer(env, {
    outBillNo: 'TBP20260829ABCDEF1234567890',
    openid: 'o12345678901234567890',
    amount: 20000
  }, fetchFn);
  assert.equal(result.packageInfo, 'wx-package');
  const body = JSON.parse(request.init.body);
  assert.equal(body.transfer_amount, 20000);
  assert.equal(body.transfer_scene_id, '1005');
  assert.equal(body.user_recv_perception, '劳务报酬');
  assert.deepEqual(body.transfer_scene_report_infos, [
    { info_type: '岗位类型', info_content: '渠道推广' },
    { info_type: '报酬说明', info_content: 'AI Skills订单渠道佣金' }
  ]);
  await createWechatTransfer(env, {
    outBillNo: 'TBP20260829ABCDEF1234567892',
    openid: 'o12345678901234567890',
    amount: 20000,
    purpose: 'channel_system_test'
  }, fetchFn);
  const testBody = JSON.parse(request.init.body);
  assert.equal(testBody.transfer_remark, 'Tech Bridge渠道测试报酬');
  assert.equal(testBody.transfer_scene_report_infos[1].info_content, '首次渠道系统联调报酬');
  await assert.rejects(() => createWechatTransfer(env, {
    outBillNo: 'TBP20260829ABCDEF1234567891', openid: 'o12345678901234567890', amount: 40000
  }, fetchFn), /invalid_transfer_amount/);
});

test('reads the WeChat operation-account balance without enabling transfers', async () => {
  const env = {
    WXPAY_MCHID: '1111987017',
    WXPAY_CERT_SERIAL: 'CERT123',
    WXPAY_PRIVATE_KEY_PATH: '/unused',
    WXPAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
  const balance = await queryOperationBalance(env, async (url) => {
    assert.equal(String(url), 'https://api.mch.weixin.qq.com/v3/merchant/fund/balance/OPERATION');
    return Response.json({ available_amount: 20000, pending_amount: 0 });
  });
  assert.deepEqual(balance, { availableAmount: 20000, pendingAmount: 0, currency: 'cny' });
});
