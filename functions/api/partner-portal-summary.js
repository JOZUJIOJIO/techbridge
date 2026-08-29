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
  if (commission.status === 'transferred') return 'settled';
  if (commission.status === 'transferring') return 'settling';
  if (commission.status === 'cancelled' || commission.status === 'reversal_required') return 'cancelled';
  if (commission.status === 'eligible') return 'attention';
  return 'pending';
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
    select: 'id,stripe_checkout_session_id,order_provider,order_reference,gross_amount,commission_amount,currency,status,eligible_at,transferred_at,created_at',
    order: 'created_at.desc',
    limit: '100'
  });
  const [response, productsResponse, ratesResponse] = await Promise.all([
    fetch(`${base}/rest/v1/partner_order_commissions?${params}`, { headers: supabaseServiceHeaders(env) }),
    fetch(`${base}/rest/v1/distribution_products?status=eq.active&select=id,slug,name,summary,landing_path,price_amount,currency,default_commission_amount,poster_eyebrow,poster_title,poster_subtitle&order=created_at.asc`, { headers: supabaseServiceHeaders(env) }),
    fetch(`${base}/rest/v1/distribution_product_commissions?partner_id=eq.${encodeURIComponent(partner.id)}&status=eq.active&select=product_id,commission_amount`, { headers: supabaseServiceHeaders(env) })
  ]);
  if (!response.ok) return json({ error: 'orders_unavailable', message: '订单暂时无法读取。' }, 502);
  const rows = await response.json();
  const products = productsResponse.ok ? await productsResponse.json() : [];
  const rates = ratesResponse.ok ? await ratesResponse.json() : [];
  const rateMap = new Map(rates.map((rate) => [rate.product_id, rate.commission_amount]));
  const primaryProduct = products[0];
  const primaryCommissionAmount = primaryProduct
    ? (rateMap.get(primaryProduct.id) || primaryProduct.default_commission_amount)
    : partner.commission_amount;

  let available = 0;
  let pending = 0;
  let withdrawn = 0;
  let nextPayout = 0;
  for (const row of rows) {
    const state = orderStatus(row);
    if (state === 'attention') {
      available += Number(row.commission_amount || 0);
      if (!nextPayout && Number(row.commission_amount) <= 20_000) nextPayout = Number(row.commission_amount);
    }
    if (state === 'pending') pending += Number(row.commission_amount || 0);
    if (state === 'settled') withdrawn += Number(row.commission_amount || 0);
  }

  const touch = fetch(`${base}/rest/v1/partner_portal_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify({ last_seen_at: new Date().toISOString() })
  }).catch(() => null);
  if (ctx?.waitUntil) ctx.waitUntil(touch);

  const site = String(env.PUBLIC_SITE_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
  return json({
    success: true,
    partner: {
      displayName: partner.display_name,
      code: partner.partner_code,
      tier: partner.partner_tier,
      commission: money(primaryCommissionAmount),
      payoutDelayDays: partner.payout_delay_days,
      payoutMethod: partner.payout_method,
      autoSettlement: partner.payout_method === 'wechat_profit_sharing',
      profitSharingReceiverReady: partner.profit_sharing_receiver_status === 'ready',
      minimumPayout: money(partner.minimum_payout_amount),
      wechatBound: Boolean(partner.wechat_openid && partner.wechat_appid && partner.wechat_bound_at)
    },
    promotion: {
      link: `${site}/s/${partner.partner_code}`,
      qr: `${site}/api/partner-qr?code=${encodeURIComponent(partner.partner_code)}`
    },
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      summary: product.summary,
      landingPath: product.landing_path,
      price: money(product.price_amount, product.currency),
      commission: money(rateMap.get(product.id) || product.default_commission_amount, product.currency),
      posterEyebrow: product.poster_eyebrow,
      posterTitle: product.poster_title || product.name,
      posterSubtitle: product.poster_subtitle || product.summary,
      link: `${site}/p/${product.slug}?ref=${partner.partner_code}`,
      qr: `${site}/api/distribution/product-qr?slug=${encodeURIComponent(product.slug)}&ref=${encodeURIComponent(partner.partner_code)}`
    })),
    balance: {
      available: money(available),
      pending: money(pending),
      withdrawn: money(withdrawn),
      nextPayout: money(nextPayout)
    },
    orders: rows.map((row) => ({
      id: partnerOrderLabel(row.order_reference || row.stripe_checkout_session_id),
      createdAt: row.created_at,
      eligibleAt: row.eligible_at,
      gross: money(row.gross_amount, row.currency),
      commission: money(row.commission_amount, row.currency),
      status: orderStatus(row)
    }))
  });
}
