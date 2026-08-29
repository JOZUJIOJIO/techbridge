import QRCode from 'qrcode';
import { activePartnerByCode, isPartnerCode } from '../lib/partner-program.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!isPartnerCode(code)) return json({ error: 'invalid_partner_code' }, 400);
  const partner = await activePartnerByCode(env, code);
  if (!partner) return json({ error: 'partner_not_found' }, 404);

  const siteUrl = String(env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const referralUrl = `${siteUrl}/s/${partner.partner_code}`;
  const svg = await QRCode.toString(referralUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#151513', light: '#ffffff' }
  });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-disposition': `inline; filename="techbridge-${partner.partner_code}.svg"`,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff'
    }
  });
}
