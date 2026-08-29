import { decryptWechatPayResource, verifyWechatPaySignature } from './wechatpay-webhook.js';
import { supabaseBaseUrl, supabaseServiceHeaders } from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function rpc(env, name, body) {
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${name}_failed:${response.status}:${await response.text()}`);
}

export async function onRequestPost({ request, env }) {
  const required = [
    'WECHATPAY_MCHID',
    'WECHATPAY_API_V3_KEY',
    'WECHATPAY_PLATFORM_CERT_PEM',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  if (required.some((key) => !env[key])) return json({ error: 'missing_config' }, 503);

  const body = await request.text();
  const valid = verifyWechatPaySignature({
    body,
    signature: request.headers.get('wechatpay-signature'),
    timestamp: request.headers.get('wechatpay-timestamp'),
    nonce: request.headers.get('wechatpay-nonce'),
    platformCertificate: env.WECHATPAY_PLATFORM_CERT_PEM
  });
  if (!valid) return json({ error: 'invalid_signature' }, 401);

  let notification;
  let transfer;
  try {
    notification = JSON.parse(body);
    transfer = decryptWechatPayResource(notification.resource, env.WECHATPAY_API_V3_KEY);
  } catch (error) {
    return json({ error: 'invalid_resource', message: error.message }, 400);
  }

  const outBillNo = String(transfer.out_bill_no || '');
  const transferBillNo = String(transfer.transfer_bill_no || '');
  const state = String(transfer.state || transfer.transfer_bill_state || '').toUpperCase();
  if (!outBillNo || !/^TBP[A-Z0-9]{10,29}$/.test(outBillNo)) {
    return json({ error: 'invalid_out_bill_no' }, 400);
  }
  if (transfer.appid && String(transfer.appid) !== String(env.WECHATPAY_TRANSFER_APP_ID || '')) {
    return json({ error: 'appid_mismatch' }, 403);
  }

  try {
    if (state === 'SUCCESS') {
      await rpc(env, 'complete_partner_payout_request', {
        p_out_bill_no: outBillNo,
        p_external_transfer_id: transferBillNo
      });
    } else if (state === 'FAIL' || state === 'FAILED' || state === 'CANCELLED' || state === 'CANCELED') {
      await rpc(env, 'release_partner_payout_by_bill_no', {
        p_out_bill_no: outBillNo,
        p_error: String(transfer.fail_reason || transfer.fail_reason_type || state).slice(0, 500),
        p_cancelled: state === 'CANCELLED' || state === 'CANCELED'
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'wechat_partner_transfer_callback_failed', outBillNo, state, reason: error.message }));
    return json({ error: 'callback_processing_failed' }, 500);
  }
}
