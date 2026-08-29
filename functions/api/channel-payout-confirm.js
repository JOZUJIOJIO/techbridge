import {
  partnerPortalSession,
  supabaseBaseUrl,
  supabaseServiceHeaders
} from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  let auth;
  try {
    auth = await partnerPortalSession(env, request);
  } catch {
    return json({ error: 'service_unavailable', message: '渠道中心暂时不可用。' }, 503);
  }
  if (!auth) return json({ error: 'unauthorized', message: '渠道邀请无效或已过期。' }, 401);
  const body = await request.json().catch(() => ({}));
  const requestId = String(body.requestId || '');
  if (!/^[a-f0-9-]{36}$/.test(requestId)) return json({ error: 'invalid_request' }, 400);

  const params = new URLSearchParams({
    id: `eq.${requestId}`,
    partner_id: `eq.${auth.partner.id}`,
    select: 'id,amount,status,package_info,external_transfer_id,processed_at',
    limit: '1'
  });
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_payout_requests?${params}`, {
    headers: supabaseServiceHeaders(env)
  });
  if (!response.ok) return json({ error: 'payout_unavailable' }, 502);
  const payout = (await response.json())[0];
  if (!payout || Number(payout.amount) !== 20_000) return json({ error: 'payout_not_found' }, 404);
  if (payout.status === 'success') return json({ success: true, state: 'success' });
  if (payout.status !== 'wait_user_confirm' || !payout.package_info) {
    return json({ error: 'payout_not_confirmable', state: payout.status }, 409);
  }
  return json({
    success: true,
    state: 'wait_user_confirm',
    amount: 20_000,
    merchantId: env.WECHATPAY_MCHID,
    appId: env.WECHATPAY_TRANSFER_APP_ID,
    packageInfo: payout.package_info
  });
}
