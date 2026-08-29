import QRCode from 'qrcode';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '');
  const reference = String(url.searchParams.get('ref') || '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) || !/^[0-9]{4}$/.test(reference)) {
    return Response.json({ error: 'invalid_product_reference' }, { status: 400 });
  }
  const site = String(env.PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');
  const svg = await QRCode.toString(`${site}/p/${slug}?ref=${reference}`, { type: 'svg', width: 512, margin: 2, color: { dark: '#151513', light: '#ffffff' } });
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' } });
}
