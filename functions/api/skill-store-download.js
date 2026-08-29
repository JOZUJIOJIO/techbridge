import {
  skillStoreDeliveryToken,
  skillStoreSafeEqual,
  skillStoreSupabaseBase,
  skillStoreSupabaseHeaders
} from '../lib/skill-store.js';

const DEFAULT_OBJECT_KEY = 'issue-001/techbridge-skill-pack-001.zip';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.SKILL_PACK_DOWNLOAD_SECRET || !env.SKILL_PACKS) {
    return json({ error: 'missing_config', message: '交付包下载服务尚未配置完成。' }, 503);
  }
  const url = new URL(request.url);
  const orderId = String(url.searchParams.get('order') || '');
  const token = String(url.searchParams.get('token') || '');
  if (!/^[a-f0-9-]{36}$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token)) {
    return json({ error: 'invalid_download_link' }, 400);
  }
  const expected = skillStoreDeliveryToken(env.SKILL_PACK_DOWNLOAD_SECRET, orderId);
  if (!skillStoreSafeEqual(token, expected)) return json({ error: 'invalid_download_token' }, 403);

  const params = new URLSearchParams({ id: `eq.${orderId}`, status: 'eq.paid', select: 'id', limit: '1' });
  const payment = await fetch(`${skillStoreSupabaseBase(env)}/rest/v1/skill_store_orders?${params}`, {
    headers: skillStoreSupabaseHeaders(env)
  });
  if (!payment.ok) return json({ error: 'payment_lookup_failed' }, 502);
  if (!(await payment.json())[0]) return json({ error: 'payment_required' }, 402);

  const objectKey = env.SKILL_PACK_ISSUE_001_KEY || DEFAULT_OBJECT_KEY;
  const object = await env.SKILL_PACKS.getWithMetadata(objectKey, { type: 'arrayBuffer' });
  if (!object?.value) return json({ error: 'skill_pack_not_found' }, 404);

  const headers = new Headers();
  headers.set('content-type', object.metadata?.contentType || 'application/zip');
  headers.set('content-disposition', 'attachment; filename="ai-skills-pack-001.zip"');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (object.metadata?.sha256) headers.set('x-content-sha256', object.metadata.sha256);
  return new Response(object.value, { headers });
}
