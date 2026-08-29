import { SKILL_EMAIL_PLAN } from '../../server/wecom-bridge/commerce-rules.mjs';

const STRIPE_API_VERSION = '2026-07-29.dahlia';
const DEFAULT_OBJECT_KEY = 'issue-001/techbridge-skill-pack-001.zip';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function tokenFor(secret, sessionId) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId)));
}

async function stripeSession(env, sessionId) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  if (!response.ok) return null;
  return response.json();
}

export async function onRequestGet({ request, env }) {
  if (!env.STRIPE_SECRET_KEY || !env.SKILL_PACK_DOWNLOAD_SECRET || !env.SKILL_PACKS) {
    return json({ error: 'missing_config', message: '交付包下载服务尚未配置完成。' }, 503);
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const token = url.searchParams.get('token') || '';
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId) || !/^[a-f0-9]{64}$/.test(token)) {
    return json({ error: 'invalid_download_link' }, 400);
  }

  const expected = await tokenFor(env.SKILL_PACK_DOWNLOAD_SECRET, sessionId);
  if (!constantTimeEqual(token, expected)) {
    return json({ error: 'invalid_download_token' }, 403);
  }

  const session = await stripeSession(env, sessionId);
  if (!session || session.payment_status !== 'paid' || session.metadata?.plan !== SKILL_EMAIL_PLAN) {
    return json({ error: 'payment_required' }, 402);
  }

  const objectKey = env.SKILL_PACK_ISSUE_001_KEY || DEFAULT_OBJECT_KEY;
  const object = await env.SKILL_PACKS.getWithMetadata(objectKey, { type: 'arrayBuffer' });
  if (!object?.value) return json({ error: 'skill_pack_not_found' }, 404);

  const headers = new Headers();
  headers.set('content-type', object.metadata?.contentType || 'application/zip');
  headers.set('content-disposition', 'attachment; filename="techbridge-skill-pack-001.zip"');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (object.metadata?.sha256) headers.set('x-content-sha256', object.metadata.sha256);
  return new Response(object.value, { headers });
}

export const __test = { tokenFor };
