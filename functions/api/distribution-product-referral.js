import { activePartnerByCode, createPartnerCookie, isPartnerCode, partnerCookieHeader } from '../lib/partner-program.js';
import { supabaseBaseUrl, supabaseServiceHeaders } from '../lib/partner-portal.js';

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet({ request, env, productSlug }) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(productSlug)) return json({ error: 'product_not_found' }, 404);
  const params = new URLSearchParams({ slug: `eq.${productSlug}`, status: 'eq.active', select: 'id,slug,landing_path', limit: '1' });
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/distribution_products?${params}`, { headers: supabaseServiceHeaders(env) });
  if (!response.ok) return json({ error: 'product_unavailable' }, 502);
  const product = (await response.json())[0];
  if (!product) return json({ error: 'product_not_found' }, 404);

  const url = new URL(request.url);
  const reference = String(url.searchParams.get('ref') || '');
  let cookie = '';
  if (reference && isPartnerCode(reference)) {
    const partner = await activePartnerByCode(env, reference);
    if (partner) cookie = partnerCookieHeader(await createPartnerCookie(env.PARTNER_REFERRAL_SECRET, reference));
  }
  const site = String(env.PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');
  const destination = new URL(product.landing_path, site);
  if (reference) destination.searchParams.set('ref', reference);
  return new Response(null, {
    status: 302,
    headers: {
      location: destination.toString(),
      ...(cookie ? { 'set-cookie': cookie } : {}),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    }
  });
}
