import assert from 'node:assert/strict';
import test from 'node:test';

import { __test, onRequestGet } from '../functions/api/skill-pack-download.js';

const sessionId = 'cs_test_ABC123';
const secret = 'download-secret';

function env() {
  return {
    STRIPE_SECRET_KEY: 'sk_test',
    SKILL_PACK_DOWNLOAD_SECRET: secret,
    SKILL_PACKS: {
      async getWithMetadata(key) {
        assert.equal(key, 'issue-001/techbridge-skill-pack-001.zip');
        return {
          value: new Uint8Array([80, 75, 3, 4]),
          metadata: {
            contentType: 'application/zip',
            sha256: 'hash-001'
          }
        };
      }
    }
  };
}

test('serves the private Skill Pack only for a paid matching Stripe session', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    payment_status: 'paid',
    metadata: { plan: 'skill_email_365' }
  });
  try {
    const token = await __test.tokenFor(secret, sessionId);
    const request = new Request(`https://qiaobit.com/api/skill-pack-download?session_id=${sessionId}&token=${token}`);
    const response = await onRequestGet({ request, env: env() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.equal(response.headers.get('x-content-sha256'), 'hash-001');
    assert.match(response.headers.get('content-disposition'), /techbridge-skill-pack-001\.zip/);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [80, 75, 3, 4]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a forged Skill Pack download token before calling Stripe', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  try {
    const request = new Request(`https://qiaobit.com/api/skill-pack-download?session_id=${sessionId}&token=${'0'.repeat(64)}`);
    const response = await onRequestGet({ request, env: env() });
    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
