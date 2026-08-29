import QRCode from 'qrcode';

import { SKILL_STORE_TOKEN_PATTERN, skillStorePaymentUrl } from '../lib/skill-store.js';

export async function onRequestGet({ request, env }) {
  const token = String(new URL(request.url).searchParams.get('ticket') || '');
  if (!SKILL_STORE_TOKEN_PATTERN.test(token)) {
    return Response.json({ error: 'invalid_order_ticket' }, { status: 400 });
  }
  const svg = await QRCode.toString(skillStorePaymentUrl(env, token), {
    type: 'svg',
    width: 512,
    margin: 2,
    color: { dark: '#151513', light: '#ffffff' }
  });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
