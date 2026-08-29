function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signature(secret, timestamp, body) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
}

export function payoutHubConfigured(env) {
  return env.WECHATPAY_MERCHANT_TRANSFER_ENABLED === 'true'
    && Boolean(env.PAYOUT_HUB_URL)
    && Boolean(env.PAYOUT_HUB_API_SECRET);
}

async function hubRequest(env, path, payload) {
  if (!payoutHubConfigured(env)) throw new Error('payout_hub_disabled');
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const response = await fetch(`${String(env.PAYOUT_HUB_URL).replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tb-timestamp': timestamp,
      'x-tb-signature': await signature(env.PAYOUT_HUB_API_SECRET, timestamp, body)
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`payout_hub_request_failed:${data.error || response.status}`);
  return data;
}

export function createPayoutHubTransfer(env, payout) {
  return hubRequest(env, '/techbridge/transfer/create', payout);
}

export function queryPayoutHubTransfer(env, outBillNo) {
  return hubRequest(env, '/techbridge/transfer/query', { outBillNo });
}
