import { createPrivateKey, randomBytes, sign as rsaSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_ORIGIN = 'https://api.mch.weixin.qq.com';
const JSAPI_PATH = '/v3/pay/transactions/jsapi';

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_wechat_jsapi_config:${missing.join(',')}`);
}

function privateKey(env) {
  return env.WXPAY_PRIVATE_KEY || readFileSync(env.WXPAY_PRIVATE_KEY_PATH, 'utf8');
}

function signValue(env, value) {
  return rsaSign('RSA-SHA256', Buffer.from(value), createPrivateKey(privateKey(env))).toString('base64');
}

function authorization(env, method, path, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const signature = signValue(env, `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${env.WXPAY_MCHID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WXPAY_CERT_SERIAL}",signature="${signature}"`;
}

export async function createWechatJsapiOrder(env, order, openid, fetchFn = fetch) {
  required(env, [
    'WXPAY_MCHID', 'WXPAY_CERT_SERIAL',
    'WXPAY_TRANSFER_APPID', 'WXPAY_PAYMENT_NOTIFY_URL'
  ]);
  if (!env.WXPAY_PRIVATE_KEY && !env.WXPAY_PRIVATE_KEY_PATH) throw new Error('missing_wechat_jsapi_config:WXPAY_PRIVATE_KEY');
  if (!/^TBS[A-Z0-9]{18,29}$/.test(String(order.order_number || ''))) throw new Error('invalid_skill_store_order_number');
  if (!/^o[A-Za-z0-9_-]{20,}$/.test(String(openid || ''))) throw new Error('invalid_skill_store_payer_openid');
  if (Number(order.gross_amount) !== 66_600 || String(order.currency).toLowerCase() !== 'cny') {
    throw new Error('invalid_skill_store_order_amount');
  }

  const body = JSON.stringify({
    appid: env.WXPAY_TRANSFER_APPID,
    mchid: env.WXPAY_MCHID,
    description: 'AI Skills年度买手服务',
    out_trade_no: order.order_number,
    time_expire: order.expires_at,
    attach: 'ai-skills-independent-store',
    notify_url: env.WXPAY_PAYMENT_NOTIFY_URL,
    amount: { total: 66_600, currency: 'CNY' },
    payer: { openid },
    ...(env.WXPAY_PROFIT_SHARING_ENABLED === 'true' && order.partner_id
      ? { settle_info: { profit_sharing: true } }
      : {})
  });
  const response = await fetchFn(`${API_ORIGIN}${JSAPI_PATH}`, {
    method: 'POST',
    headers: {
      authorization: authorization(env, 'POST', JSAPI_PATH, body),
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'AI-Skills-Store/1.0'
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.prepay_id) {
    throw new Error(`wechat_jsapi_order_failed:${data.code || response.status}:${String(data.message || '').slice(0, 200)}`);
  }
  return { prepayId: data.prepay_id, params: createWechatJsapiParams(env, data.prepay_id) };
}

export function createWechatJsapiParams(env, prepayId, now = Date.now()) {
  required(env, ['WXPAY_TRANSFER_APPID']);
  if (!env.WXPAY_PRIVATE_KEY && !env.WXPAY_PRIVATE_KEY_PATH) throw new Error('missing_wechat_jsapi_config:WXPAY_PRIVATE_KEY');
  if (!/^wx[0-9A-Za-z_-]{10,}$/.test(String(prepayId || ''))) throw new Error('invalid_wechat_prepay_id');
  const timeStamp = String(Math.floor(now / 1000));
  const nonceStr = randomBytes(16).toString('hex');
  const packageValue = `prepay_id=${prepayId}`;
  const paySign = signValue(env, `${env.WXPAY_TRANSFER_APPID}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`);
  return {
    appId: env.WXPAY_TRANSFER_APPID,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign
  };
}
