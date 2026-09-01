const MAX_BODY_BYTES = 8 * 1024;

const ALLOWED_EVENTS = new Set([
  'page_view',
  'hero_products',
  'hero_collab',
  'project_open',
  'press_open',
  'podcast_open',
  'skill_subscription_open',
  'collab_open',
  'collab_submit',
  'collab_success',
  'btx_open',
  'btx_intent',
  'btx_action'
]);

const ALLOWED_METADATA_KEYS = new Set([
  'label',
  'destination',
  'source',
  'cooperationType',
  'intent',
  'action'
]);

const ALLOWED_ATTRIBUTION_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, maxLength) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

function safeObject(value, allowedKeys, maxEntries = 8) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).slice(0, maxEntries).forEach(([key, item]) => {
    const safeKey = clean(key, 40);
    if (!safeKey || !allowedKeys.has(safeKey) || item == null) return;
    if (typeof item === 'number' || typeof item === 'boolean') result[safeKey] = item;
    else result[safeKey] = clean(item, 120);
  });
  return result;
}

function allowedOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'qiaobit.com' || hostname === 'www.qiaobit.com' || hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function normalize(payload, request) {
  const eventName = clean(payload.event, 50);
  if (!ALLOWED_EVENTS.has(eventName)) return { error: '事件类型不受支持。' };

  const viewport = clean(payload.viewport, 20);
  const attribution = safeObject(payload.attribution, ALLOWED_ATTRIBUTION_KEYS, 3);
  const metadata = safeObject(payload.metadata, ALLOWED_METADATA_KEYS, 8);
  const clientOccurredAt = new Date(payload.occurredAt || '');

  return {
    event: {
      event_name: eventName,
      session_id: clean(payload.sessionId, 80) || null,
      path: clean(payload.path, 180) || '/',
      referrer_host: clean(payload.referrerHost, 120) || null,
      viewport: ['mobile', 'tablet', 'desktop'].includes(viewport) ? viewport : 'unknown',
      language: clean(payload.language, 20) || null,
      country_code: clean(request.cf?.country, 8) || null,
      attribution,
      metadata,
      client_occurred_at: Number.isNaN(clientOccurredAt.getTime()) ? null : clientOccurredAt.toISOString()
    }
  };
}

async function saveEvent(env, event) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(JSON.stringify({ type: 'site_analytics', recorded: false, event }));
    return false;
  }

  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/site_analytics_events`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal'
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`analytics_write_failed:${response.status}:${(await response.text()).slice(0, 180)}`);
  }
  return true;
}

export async function onRequestPost({ request, env, ctx }) {
  if (!allowedOrigin(request)) return json({ error: 'forbidden' }, 403);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

  let payload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const normalized = normalize(payload, request);
  if (normalized.error) return json({ error: 'validation_failed', message: normalized.error }, 400);

  const write = saveEvent(env, normalized.event).catch((error) => {
    console.error(JSON.stringify({ type: 'site_analytics_error', message: error.message, event: normalized.event.event_name }));
  });
  if (ctx?.waitUntil) ctx.waitUntil(write);
  else await write;

  return json({ accepted: true }, 202);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
