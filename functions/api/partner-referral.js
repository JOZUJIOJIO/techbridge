import {
  activePartnerByCode,
  createPartnerCookie,
  isPartnerCode,
  partnerCookieHeader
} from '../lib/partner-program.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function onRequestGet({ request, env, partnerCode }) {
  if (!env.PARTNER_REFERRAL_SECRET || !isPartnerCode(partnerCode)) {
    return json({ error: 'invalid_partner_link' }, 404);
  }

  const partner = await activePartnerByCode(env, partnerCode);
  if (!partner) return json({ error: 'partner_not_found' }, 404);

  const cookie = await createPartnerCookie(env.PARTNER_REFERRAL_SECRET, partner.partner_code);
  const siteUrl = String(env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const location = `${siteUrl}/skill-letter?partner=${encodeURIComponent(partner.partner_code)}`;
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': partnerCookieHeader(cookie),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    }
  });
}
