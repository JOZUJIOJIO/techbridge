import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

test('never serves internal workspace paths as public assets', async () => {
  let assetCalls = 0;
  const env = { ASSETS: { fetch: async () => { assetCalls += 1; return new Response('asset'); } } };
  for (const path of [
    '/.trae/documents/plan.md',
    '/qianx-corporate/public/index.html',
    '/videos/skill-explainer/STORYBOARD.md',
    '/supabase/migrations/schema.sql',
    '/functions/api/stripe-webhook.js'
  ]) {
    const response = await worker.fetch(new Request(`https://qiaobit.com${path}`), env, {});
    assert.equal(response.status, 404, path);
  }
  assert.equal(assetCalls, 0);
});
