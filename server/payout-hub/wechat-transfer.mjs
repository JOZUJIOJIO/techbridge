import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as rsaSign,
  verify as rsaVerify,
  X509Certificate
} from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_ORIGIN = 'https://api.mch.weixin.qq.com';
const CREATE_PATH = '/v3/fund-app/mch-transfer/transfer-bills';
const CALLBACK_MAX_AGE_MS = 5 * 60 * 1000;

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_wechat_transfer_config:${missing.join(',')}`);
}

function privateKey(env) {
  return env.WXPAY_PRIVATE_KEY || readFileSync(env.WXPAY_PRIVATE_KEY_PATH, 'utf8');
}

function platformPublicKey(env) {
  const pem = env.WXPAY_PUBLIC_KEY || readFileSync(env.WXPAY_PUBLIC_KEY_PATH, 'utf8');
  return pem.includes('BEGIN CERTIFICATE') ? new X509Certificate(pem).publicKey : createPublicKey(pem);
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
      'user-agent': 'TechBridge-Payout-Hub/1.0'
    },
    ...(body ? { body } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`wechat_transfer_api_failed:${data.code || response.status}:${data.message || ''}`);
  return data;
}

export function transferEnabled(env) {
  return env.WXPAY_TRANSFER_ENABLED === 'true';
}

export async function createWechatTransfer(env, payout, fetchFn = fetch) {
  required(env, ['WXPAY_MCHID', 'WXPAY_CERT_SERIAL', 'WXPAY_PRIVATE_KEY_PATH', 'WXPAY_TRANSFER_APPID', 'WXPAY_TRANSFER_NOTIFY_URL']);
  if (!transferEnabled(env)) throw new Error('wechat_transfer_disabled');
  if (!/^TBP[A-Z0-9]{10,29}$/.test(String(payout.outBillNo || ''))) throw new Error('invalid_out_bill_no');
  if (!/^o[A-Za-z0-9_-]{20,}$/.test(String(payout.openid || ''))) throw new Error('invalid_openid');
  if (Number(payout.amount) !== 20_000) throw new Error('invalid_transfer_amount');

  const body = {
    appid: env.WXPAY_TRANSFER_APPID,
    out_bill_no: payout.outBillNo,
    transfer_scene_id: '1005',
    openid: payout.openid,
    transfer_amount: 20_000,
    transfer_remark: 'Tech Bridge渠道收入',
    notify_url: env.WXPAY_TRANSFER_NOTIFY_URL,
    user_recv_perception: '劳务报酬',
    transfer_scene_report_infos: [
      { info_type: '岗位类型', info_content: '渠道推广' },
      { info_type: '报酬说明', info_content: 'AI Skills订单渠道佣金' }
    ]
  };
  const data = await request(env, 'POST', CREATE_PATH, body, fetchFn);
  if (!data.package_info || !data.transfer_bill_no) throw new Error('wechat_transfer_response_incomplete');
  return {
    merchantId: env.WXPAY_MCHID,
    appId: env.WXPAY_TRANSFER_APPID,
    packageInfo: data.package_info,
    transferBillNo: data.transfer_bill_no,
    state: data.state || 'WAIT_USER_CONFIRM'
  };
}

export async function queryWechatTransfer(env, outBillNo, fetchFn = fetch) {
  required(env, ['WXPAY_MCHID', 'WXPAY_CERT_SERIAL', 'WXPAY_PRIVATE_KEY_PATH']);
  if (!transferEnabled(env)) throw new Error('wechat_transfer_disabled');
  if (!/^TBP[A-Z0-9]{10,29}$/.test(String(outBillNo || ''))) throw new Error('invalid_out_bill_no');
  const path = `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(outBillNo)}`;
  const data = await request(env, 'GET', path, null, fetchFn);
  return {
    outBillNo: data.out_bill_no,
    transferBillNo: data.transfer_bill_no,
    state: String(data.state || data.transfer_bill_state || '').toUpperCase(),
    failReason: data.fail_reason || data.fail_reason_type || ''
  };
}

export function verifyWechatCallback(env, body, headers, now = Date.now()) {
  required(env, ['WXPAY_PUBLIC_KEY_PATH']);
  const timestamp = String(headers.get('wechatpay-timestamp') || '');
  const nonce = String(headers.get('wechatpay-nonce') || '');
  const signature = String(headers.get('wechatpay-signature') || '');
  const millis = /^\d{10}$/.test(timestamp) ? Number(timestamp) * 1000 : Number.NaN;
  if (!Number.isFinite(millis) || Math.abs(now - millis) > CALLBACK_MAX_AGE_MS || !nonce || !signature) return false;
  try {
    return rsaVerify(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
      platformPublicKey(env),
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

export function decryptWechatCallback(env, resource) {
  required(env, ['WXPAY_API_V3_KEY']);
  const encrypted = Buffer.from(resource?.ciphertext || '', 'base64');
  if (encrypted.length <= 16 || !resource?.nonce) throw new Error('invalid_wechat_callback_resource');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.WXPAY_API_V3_KEY, 'utf8'), Buffer.from(resource.nonce, 'utf8'));
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  decipher.setAuthTag(encrypted.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'));
}
