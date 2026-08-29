import { createPrivateKey, randomBytes, sign as rsaSign } from 'node:crypto';

const TRANSFER_PATH = '/v3/fund-app/mch-transfer/transfer-bills';
const API_ORIGIN = 'https://api.mch.weixin.qq.com';

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_wechat_transfer_config:${missing.join(',')}`);
}

function nonce() {
  return randomBytes(16).toString('hex');
}

function sceneReportInfos(env) {
  if (!env.WECHATPAY_TRANSFER_SCENE_REPORT_INFOS_JSON) return undefined;
  let value;
  try {
    value = JSON.parse(env.WECHATPAY_TRANSFER_SCENE_REPORT_INFOS_JSON);
  } catch {
    throw new Error('invalid_wechat_transfer_scene_report_infos');
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('invalid_wechat_transfer_scene_report_infos');
  }
  return value;
}

export function merchantTransferConfigured(env) {
  return env.WECHATPAY_MERCHANT_TRANSFER_ENABLED === 'true'
    && Boolean(env.WECHATPAY_MCHID)
    && Boolean(env.WECHATPAY_MERCHANT_PRIVATE_KEY_PEM)
    && Boolean(env.WECHATPAY_MERCHANT_CERT_SERIAL)
    && Boolean(env.WECHATPAY_TRANSFER_APP_ID)
    && Boolean(env.WECHATPAY_TRANSFER_SCENE_ID)
    && Boolean(env.WECHATPAY_TRANSFER_NOTIFY_URL);
}

export function createWechatPayAuthorization({ method, path, body, merchantId, serialNumber, privateKey, timestamp, nonceStr }) {
  const payload = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = rsaSign('RSA-SHA256', Buffer.from(payload), createPrivateKey(privateKey)).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${merchantId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNumber}",signature="${signature}"`;
}

export async function createWechatBalanceTransfer(env, payout) {
  required(env, [
    'WECHATPAY_MCHID',
    'WECHATPAY_MERCHANT_PRIVATE_KEY_PEM',
    'WECHATPAY_MERCHANT_CERT_SERIAL',
    'WECHATPAY_TRANSFER_APP_ID',
    'WECHATPAY_TRANSFER_SCENE_ID',
    'WECHATPAY_TRANSFER_NOTIFY_URL'
  ]);
  if (env.WECHATPAY_MERCHANT_TRANSFER_ENABLED !== 'true') {
    throw new Error('wechat_transfer_disabled');
  }
  if (!/^TBP[A-Z0-9]{10,29}$/.test(String(payout.outBillNo || ''))) {
    throw new Error('invalid_wechat_transfer_out_bill_no');
  }
  if (!/^o[A-Za-z0-9_-]{20,}$/.test(String(payout.openid || ''))) {
    throw new Error('invalid_wechat_transfer_openid');
  }
  if (!Number.isInteger(payout.amount) || payout.amount <= 0) {
    throw new Error('invalid_wechat_transfer_amount');
  }

  const bodyData = {
    appid: env.WECHATPAY_TRANSFER_APP_ID,
    out_bill_no: payout.outBillNo,
    transfer_scene_id: env.WECHATPAY_TRANSFER_SCENE_ID,
    openid: payout.openid,
    transfer_amount: payout.amount,
    transfer_remark: String(payout.remark || 'Tech Bridge 渠道合作收入').slice(0, 32),
    notify_url: env.WECHATPAY_TRANSFER_NOTIFY_URL
  };
  const reportInfos = sceneReportInfos(env);
  if (reportInfos) bodyData.transfer_scene_report_infos = reportInfos;

  const body = JSON.stringify(bodyData);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonce();
  const authorization = createWechatPayAuthorization({
    method: 'POST',
    path: TRANSFER_PATH,
    body,
    merchantId: env.WECHATPAY_MCHID,
    serialNumber: env.WECHATPAY_MERCHANT_CERT_SERIAL,
    privateKey: env.WECHATPAY_MERCHANT_PRIVATE_KEY_PEM,
    timestamp,
    nonceStr
  });

  const response = await fetch(`${API_ORIGIN}${TRANSFER_PATH}`, {
    method: 'POST',
    headers: {
      authorization,
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'TechBridge-Partner-Payout/1.0'
    },
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(result.message || result.code || response.status).slice(0, 300);
    throw new Error(`wechat_transfer_create_failed:${detail}`);
  }
  if (!result.package_info || !result.transfer_bill_no) {
    throw new Error('wechat_transfer_response_incomplete');
  }
  return {
    appId: env.WECHATPAY_TRANSFER_APP_ID,
    merchantId: env.WECHATPAY_MCHID,
    packageInfo: result.package_info,
    transferBillNo: result.transfer_bill_no,
    state: result.state || 'WAIT_USER_CONFIRM'
  };
}

export async function queryWechatBalanceTransfer(env, outBillNo) {
  required(env, [
    'WECHATPAY_MCHID',
    'WECHATPAY_MERCHANT_PRIVATE_KEY_PEM',
    'WECHATPAY_MERCHANT_CERT_SERIAL'
  ]);
  if (env.WECHATPAY_MERCHANT_TRANSFER_ENABLED !== 'true') {
    throw new Error('wechat_transfer_disabled');
  }
  if (!/^TBP[A-Z0-9]{10,29}$/.test(String(outBillNo || ''))) {
    throw new Error('invalid_wechat_transfer_out_bill_no');
  }

  const path = `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(outBillNo)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonce();
  const authorization = createWechatPayAuthorization({
    method: 'GET',
    path,
    body: '',
    merchantId: env.WECHATPAY_MCHID,
    serialNumber: env.WECHATPAY_MERCHANT_CERT_SERIAL,
    privateKey: env.WECHATPAY_MERCHANT_PRIVATE_KEY_PEM,
    timestamp,
    nonceStr
  });
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers: {
      authorization,
      accept: 'application/json',
      'user-agent': 'TechBridge-Partner-Payout/1.0'
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`wechat_transfer_query_failed:${String(result.message || result.code || response.status).slice(0, 300)}`);
  }
  return {
    outBillNo: result.out_bill_no,
    transferBillNo: result.transfer_bill_no,
    state: String(result.state || result.transfer_bill_state || '').toUpperCase(),
    failReason: result.fail_reason || result.fail_reason_type || ''
  };
}
