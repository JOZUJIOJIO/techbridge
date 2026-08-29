import { createPrivateKey, randomBytes, sign as rsaSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_ORIGIN = 'https://api.mch.weixin.qq.com';
const RECEIVER_PATH = '/v3/profitsharing/receivers/add';
const ORDER_PATH = '/v3/profitsharing/orders';

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_wechat_profit_sharing_config:${missing.join(',')}`);
}

function privateKey(env) {
  return env.WXPAY_PRIVATE_KEY || readFileSync(env.WXPAY_PRIVATE_KEY_PATH, 'utf8');
}

function authorization(env, method, path, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign('RSA-SHA256', Buffer.from(message), createPrivateKey(privateKey(env))).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${env.WXPAY_MCHID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WXPAY_CERT_SERIAL}",signature="${signature}"`;
}

async function request(env, method, path, bodyData, fetchFn) {
  const body = bodyData ? JSON.stringify(bodyData) : '';
  const response = await fetchFn(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: authorization(env, method, path, body),
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      'user-agent': 'AI-Skills-Profit-Sharing/1.0'
    },
    ...(body ? { body } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`wechat_profit_sharing_api_failed:${data.code || response.status}:${String(data.message || '').slice(0, 240)}`);
    error.code = data.code || String(response.status);
    error.status = response.status;
    error.apiMessage = String(data.message || '');
    throw error;
  }
  return data;
}

export function profitSharingEnabled(env) {
  return env.WXPAY_PROFIT_SHARING_ENABLED === 'true';
}

function validateCommon(env, openid) {
  required(env, ['WXPAY_MCHID', 'WXPAY_CERT_SERIAL', 'WXPAY_TRANSFER_APPID']);
  if (!env.WXPAY_PRIVATE_KEY && !env.WXPAY_PRIVATE_KEY_PATH) {
    throw new Error('missing_wechat_profit_sharing_config:WXPAY_PRIVATE_KEY');
  }
  if (!profitSharingEnabled(env)) throw new Error('wechat_profit_sharing_disabled');
  if (!/^o[A-Za-z0-9_-]{20,}$/.test(String(openid || ''))) throw new Error('invalid_profit_sharing_openid');
}

export async function addProfitSharingReceiver(env, openid, fetchFn = fetch) {
  validateCommon(env, openid);
  return request(env, 'POST', RECEIVER_PATH, {
    appid: env.WXPAY_TRANSFER_APPID,
    type: 'PERSONAL_OPENID',
    account: openid,
    relation_type: 'DISTRIBUTOR'
  }, fetchFn);
}

export function profitSharingOrderNumber(commissionId) {
  const compact = String(commissionId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (compact.length < 16) throw new Error('invalid_profit_sharing_commission_id');
  return `TBPS${compact}`.slice(0, 64);
}

export async function createProfitSharingOrder(env, commission, fetchFn = fetch) {
  validateCommon(env, commission.openid);
  if (!/^\d{20,40}$/.test(String(commission.transactionId || ''))) throw new Error('invalid_profit_sharing_transaction_id');
  if (!/^TBPS[A-Z0-9]{16,60}$/.test(String(commission.outOrderNo || ''))) throw new Error('invalid_profit_sharing_order_number');
  if (Number(commission.amount) !== 19_980) throw new Error('invalid_profit_sharing_amount');
  return request(env, 'POST', ORDER_PATH, {
    appid: env.WXPAY_TRANSFER_APPID,
    transaction_id: commission.transactionId,
    out_order_no: commission.outOrderNo,
    receivers: [{
      type: 'PERSONAL_OPENID',
      account: commission.openid,
      amount: 19_980,
      description: 'AI Skills渠道收益'
    }],
    unfreeze_unsplit: true
  }, fetchFn);
}

export async function queryProfitSharingOrder(env, order, fetchFn = fetch) {
  required(env, ['WXPAY_MCHID', 'WXPAY_CERT_SERIAL']);
  if (!env.WXPAY_PRIVATE_KEY && !env.WXPAY_PRIVATE_KEY_PATH) {
    throw new Error('missing_wechat_profit_sharing_config:WXPAY_PRIVATE_KEY');
  }
  if (!profitSharingEnabled(env)) throw new Error('wechat_profit_sharing_disabled');
  if (!/^\d{20,40}$/.test(String(order.transactionId || ''))) throw new Error('invalid_profit_sharing_transaction_id');
  if (!/^TBPS[A-Z0-9]{16,60}$/.test(String(order.outOrderNo || ''))) throw new Error('invalid_profit_sharing_order_number');
  const path = `${ORDER_PATH}/${encodeURIComponent(order.outOrderNo)}?transaction_id=${encodeURIComponent(order.transactionId)}`;
  return request(env, 'GET', path, null, fetchFn);
}

export function receiverSucceeded(result, openid) {
  return Array.isArray(result?.receivers)
    && result.receivers.some((receiver) => receiver.type === 'PERSONAL_OPENID'
      && receiver.account === openid
      && receiver.result === 'SUCCESS');
}

export function receiverClosed(result, openid) {
  return Array.isArray(result?.receivers)
    && result.receivers.some((receiver) => receiver.type === 'PERSONAL_OPENID'
      && receiver.account === openid
      && receiver.result === 'CLOSED');
}

export function receiverAlreadyExists(error) {
  return ['RELATION_EXISTS', 'RECEIVER_ALREADY_EXISTS'].includes(String(error?.code || ''))
    || /已存在|already exists/i.test(String(error?.apiMessage || error?.message || ''));
}

export function settlementPending(error) {
  return ['FREQUENCY_LIMITED', 'SYSTEM_ERROR'].includes(String(error?.code || ''))
    || /订单处理中|未结算|结算周期|请稍后|processing|settlement/i.test(String(error?.apiMessage || error?.message || ''));
}
