import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';

import {
  createWechatBalanceTransfer,
  createWechatPayAuthorization,
  merchantTransferConfigured
} from '../functions/lib/wechatpay-transfer.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

test('signs WeChat Pay API v3 merchant requests with the merchant key', () => {
  const body = JSON.stringify({ appid: 'wx_app', transfer_amount: 40000 });
  const authorization = createWechatPayAuthorization({
    method: 'POST',
    path: '/v3/test',
    body,
    merchantId: '1900000109',
    serialNumber: 'SERIAL123',
    privateKey: privateKeyPem,
    timestamp: '1787961600',
    nonceStr: 'nonce123'
  });
  const signature = authorization.match(/signature="([^"]+)"/)?.[1];
  assert.ok(signature);
  assert.equal(verifySignature(
    'RSA-SHA256',
    Buffer.from(`POST\n/v3/test\n1787961600\nnonce123\n${body}\n`),
    publicKey,
    Buffer.from(signature, 'base64')
  ), true);
});

test('creates a user-confirmed WeChat balance transfer with fixed cents', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({
      transfer_bill_no: '1330000071100999991182020050700019480001',
      package_info: 'affffddafdfafddffda==',
      state: 'WAIT_USER_CONFIRM'
    });
  };
  const env = {
    WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'true',
    WECHATPAY_MCHID: '1900000109',
    WECHATPAY_MERCHANT_PRIVATE_KEY_PEM: privateKeyPem,
    WECHATPAY_MERCHANT_CERT_SERIAL: 'SERIAL123',
    WECHATPAY_TRANSFER_APP_ID: 'wx_test_skill_letter',
    WECHATPAY_TRANSFER_SCENE_ID: '1005',
    WECHATPAY_TRANSFER_NOTIFY_URL: 'https://qiaobit.com/api/wechatpay-transfer-webhook',
    WECHATPAY_TRANSFER_SCENE_REPORT_INFOS_JSON: JSON.stringify([{ info_type: '岗位类型', info_content: '渠道合作' }])
  };
  try {
    assert.equal(merchantTransferConfigured(env), true);
    const result = await createWechatBalanceTransfer(env, {
      outBillNo: 'TBP20260829ABCDEF1234567890',
      openid: 'o12345678901234567890',
      amount: 40_000,
      remark: 'Tech Bridge 合作收入'
    });
    assert.equal(result.packageInfo, 'affffddafdfafddffda==');
    const request = calls[0];
    assert.equal(request.url, 'https://api.mch.weixin.qq.com/v3/fund-app/mch-transfer/transfer-bills');
    const body = JSON.parse(request.init.body);
    assert.equal(body.transfer_amount, 40_000);
    assert.equal(body.openid, 'o12345678901234567890');
    assert.equal(body.appid, 'wx_test_skill_letter');
    assert.deepEqual(body.transfer_scene_report_infos, [{ info_type: '岗位类型', info_content: '渠道合作' }]);
    assert.match(request.init.headers.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps merchant transfers disabled unless the explicit switch is true', () => {
  assert.equal(merchantTransferConfigured({ WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'false' }), false);
});
