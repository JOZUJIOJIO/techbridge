import QRCode from 'qrcode';

function response(body, status = 200, contentType = 'application/json; charset=utf-8') {
  return new Response(body, { status, headers: { 'content-type': contentType, 'cache-control': 'no-store' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(slug)) return response(JSON.stringify({ error: 'invalid_invite' }), 400);
  const site = String(env.PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');
  const svg = await QRCode.toString(`${site}/join/${slug}`, { type: 'svg', width: 512, margin: 2, color: { dark: '#151513', light: '#ffffff' } });
  return response(svg, 200, 'image/svg+xml; charset=utf-8');
}
