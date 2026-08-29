import {
  money,
  partnerOrderLabel,
  partnerPortalSession,
  supabaseBaseUrl,
  supabaseServiceHeaders
} from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function orderStatus(commission) {
  if (commission.status === 'transferred') return 'withdrawn';
  if (commission.status === 'transferring') return 'withdrawing';
  if (commission.status === 'cancelled' || commission.status === 'reversal_required') return 'cancelled';
  return Date.parse(commission.eligible_at) <= Date.now() ? 'available' : 'pending';
}

export async function onRequestGet({ request, env, ctx }) {
  let auth;
  try {
    auth = await partnerPortalSession(env, request);
  } catch (error) {
    console.error(JSON.stringify({ event: 'partner_portal_auth_failed', reason: error.message }));
    return json({ error: 'service_unavailable', message: '渠道中心暂时不可用。' }, 503);
  }
  if (!auth) return json({ error: 'unauthorized', message: '专属访问链接无效或已过期。' }, 401);

  const { session, partner } = auth;
  const base = supabaseBaseUrl(env);
  const params = new URLSearchParams({
    partner_id: `eq.${partner.id}`,
    select: 'id,stripe_checkout_session_id,gross_amount,commission_amount,currency,status,eligible_at,transferred_at,created_at',
    order: 'created_at.desc',
    limit: '100'
  });
  const response = await fetch(`${base}/rest/v1/partner_order_commissions?${params}`, {
    headers: supabaseServiceHeaders(env)
  });
  if (!response.ok) return json({ error: 'orders_unavailable', message: '订单暂时无法读取。' }, 502);
  const rows = await response.json();

  let available = 0;
  let pending = 0;
  let withdrawn = 0;
  let nextPayout = 0;
  for (const row of rows) {
    const state = orderStatus(row);
    if (state === 'available') {
      available += Number(row.commission_amount || 0);
      if (!nextPayout && Number(row.commission_amount) <= 20_000) nextPayout = Number(row.commission_amount);
    }
    if (state === 'pending') pending += Number(row.commission_amount || 0);
    if (state === 'withdrawn') withdrawn += Number(row.commission_amount || 0);
  }

  const touch = fetch(`${base}/rest/v1/partner_portal_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify({ last_seen_at: new Date().toISOString() })
  }).catch(() => null);
  if (ctx?.waitUntil) ctx.waitUntil(touch);

  const site = String(env.PUBLIC_SITE_URL || 'https://qiaobit.com').replace(/\/$/, '');
  return json({
    success: true,
    partner: {
      displayName: partner.display_name,
      code: partner.partner_code,
      tier: partner.partner_tier,
      commission: money(partner.commission_amount),
      payoutDelayDays: partner.payout_delay_days,
      payoutMethod: partner.payout_method,
      minimumPayout: money(partner.minimum_payout_amount),
      wechatBound: Boolean(partner.wechat_openid && partner.wechat_appid && partner.wechat_bound_at)
    },
    promotion: {
      link: `${site}/s/${partner.partner_code}`,
      qr: `${site}/api/partner-qr?code=${encodeURIComponent(partner.partner_code)}`
    },
    balance: {
      available: money(available),
      pending: money(pending),
      withdrawn: money(withdrawn),
      nextPayout: money(nextPayout)
    },
    orders: rows.map((row) => ({
      id: partnerOrderLabel(row.stripe_checkout_session_id),
      createdAt: row.created_at,
      eligibleAt: row.eligible_at,
      gross: money(row.gross_amount, row.currency),
      commission: money(row.commission_amount, row.currency),
      status: orderStatus(row)
    }))
  });
}
