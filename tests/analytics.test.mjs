import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/analytics.js';

function requestFor(payload, origin = 'https://qiaobit.com') {
  return new Request('https://qiaobit.com/api/analytics', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

function validPayload() {
  return {
    event: 'project_open',
    occurredAt: '2026-08-21T08:00:00.000Z',
    sessionId: 'session-test',
    path: '/index.html',
    viewport: 'desktop',
    language: 'zh-CN',
    attribution: { utm_source: 'x', unexpected: 'drop-me' },
    metadata: { destination: 'ai-skills', email: 'must-not-be-stored@example.com' }
  };
}

test('rejects unknown analytics events', async () => {
  const response = await onRequestPost({
    request: requestFor({ ...validPayload(), event: 'arbitrary_event' }),
    env: {},
    ctx: { waitUntil() {} }
  });
  assert.equal(response.status, 400);
});

test('rejects cross-origin writes', async () => {
  const response = await onRequestPost({
    request: requestFor(validPayload(), 'https://example.com'),
    env: {},
    ctx: { waitUntil() {} }
  });
  assert.equal(response.status, 403);
});

test('stores only approved privacy-minimized fields', async () => {
  const originalFetch = globalThis.fetch;
  let savedBody;
  globalThis.fetch = async (_url, options) => {
    savedBody = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  };

  try {
    let pending;
    const response = await onRequestPost({
      request: requestFor(validPayload()),
      env: {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role'
      },
      ctx: { waitUntil(value) { pending = value; } }
    });
    await pending;

    assert.equal(response.status, 202);
    assert.equal(savedBody.event_name, 'project_open');
    assert.equal(savedBody.metadata.destination, 'ai-skills');
    assert.equal(savedBody.metadata.email, undefined);
    assert.equal(savedBody.attribution.utm_source, 'x');
    assert.equal(savedBody.attribution.unexpected, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
