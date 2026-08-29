import { createHash, createHmac, randomBytes } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PAYOUT_HUB_URL', 'PAYOUT_HUB_API_SECRET'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`missing ${name}`);
}

const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const headers = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json'
};
const channelCode = process.argv[2] || 'flow-test-260829';

async function rest(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`supabase_failed:${response.status}:${data.message || ''}`);
  return data;
}

const channels = await rest(`/rest/v1/distribution_partners?partner_code=eq.${encodeURIComponent(channelCode)}&select=id,partner_code,wechat_openid,wechat_appid&limit=1`);
const channel = channels[0];
if (!channel?.wechat_openid || channel.wechat_appid !== 'wxaab68c7822881159') throw new Error('test_channel_not_bound');

await rest(`/rest/v1/distribution_partners?id=eq.${encodeURIComponent(channel.id)}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'active', portal_enabled: true, payout_method: 'wechat_balance', updated_at: new Date().toISOString() })
});

const portalToken = `tbp_${randomBytes(32).toString('base64url')}`;
const tokenHash = createHash('sha256').update(portalToken).digest('hex');
await rest('/rest/v1/partner_portal_sessions', {
  method: 'POST',
  body: JSON.stringify({ partner_id: channel.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
});

const outBillNo = `TBP${new Date().toISOString().slice(0, 10).replaceAll('-', '')}${randomBytes(6).toString('hex').toUpperCase()}`;
const payoutRows = await rest('/rest/v1/partner_payout_requests', {
  method: 'POST',
  headers: { prefer: 'return=representation' },
  body: JSON.stringify({
    partner_id: channel.id,
    idempotency_key: `channel-system-test-${Date.now()}`,
    payout_method: 'wechat_balance',
    amount: 20_000,
    currency: 'cny',
    status: 'processing',
    out_bill_no: outBillNo
  })
});
const payout = payoutRows[0];

const transferBody = JSON.stringify({
  outBillNo,
  openid: channel.wechat_openid,
  amount: 20_000,
  purpose: 'channel_system_test'
});
const timestamp = String(Date.now());
const signature = createHmac('sha256', process.env.PAYOUT_HUB_API_SECRET).update(`${timestamp}.${transferBody}`).digest('hex');
const transferResponse = await fetch(`${process.env.PAYOUT_HUB_URL.replace(/\/$/, '')}/techbridge/transfer/create`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-tb-timestamp': timestamp, 'x-tb-signature': signature },
  body: transferBody
});
const transfer = await transferResponse.json().catch(() => ({}));
if (!transferResponse.ok) {
  await rest(`/rest/v1/partner_payout_requests?id=eq.${payout.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'failed', last_error: String(transfer.error || transferResponse.status), processed_at: new Date().toISOString() })
  });
  throw new Error(`transfer_create_failed:${transfer.error || transferResponse.status}`);
}

await rest(`/rest/v1/partner_payout_requests?id=eq.${payout.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'wait_user_confirm',
    external_transfer_id: transfer.transferBillNo,
    package_info: transfer.packageInfo,
    updated_at: new Date().toISOString()
  })
});

console.log(JSON.stringify({
  requestId: payout.id,
  outBillNo,
  confirmationUrl: `https://qiaobit.com/channel?confirm=${payout.id}#token=${portalToken}`
}, null, 2));
