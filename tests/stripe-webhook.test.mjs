import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/stripe-webhook.js';

const secret = 'whsec_test';

async function signedRequest(event) {
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  const digest = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return new Request('https://qiaobit.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${digest}` },
    body: rawBody
  });
}

function checkoutEvent(id = 'evt_test') {
  return {
    id,
    type: 'checkout.session.completed',
    created: 1784121032,
    data: {
      object: {
        id: `cs_${id}`,
        customer: `cus_${id}`,
        customer_details: { email: 'buyer@example.com', name: '测试用户' },
        metadata: { plan: 'skill_email_365', source: 'qiaobit-homepage' },
        payment_intent: `pi_${id}`,
        payment_status: 'paid',
        subscription: null,
        amount_total: 990,
        currency: 'cny'
      }
    }
  };
}

function testEnv() {
  return {
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    FEISHU_APP_ID: 'app-id',
    FEISHU_APP_SECRET: 'app-secret',
    FEISHU_REVENUE_BASE_TOKEN: 'base-token',
    FEISHU_REVENUE_TABLE_ID: 'table-id'
  };
}

function mockFetch({ existingRecord }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });

    if (href.includes('/auth/v3/tenant_access_token/internal')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token' });
    }
    if (href.endsWith('/records/search?page_size=1')) {
      return Response.json({
        code: 0,
        data: { items: existingRecord ? [{ record_id: existingRecord }] : [] }
      });
    }
    if (href.endsWith('/records')) {
      return Response.json({ code: 0, data: { record: { record_id: 'rec_created' } } });
    }
    if (href.includes('/rest/v1/stripe_webhook_events') && init.method === 'POST') {
      return Response.json([], { status: 201 });
    }
    if (href.includes('/rest/v1/stripe_webhook_events') && init.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (href.includes('/rest/v1/stripe_webhook_events')) {
      return Response.json([{}]);
    }
    if (href.includes('/rest/v1/paid_subscribers')) {
      return Response.json({}, { status: 201 });
    }
    if (href.includes('/rest/v1/customer_attributions')) {
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

test('existing Feishu order is not created twice', async () => {
  const mock = mockFetch({ existingRecord: 'rec_existing' });
  try {
    const response = await onRequestPost({
      request: await signedRequest(checkoutEvent('evt_existing')),
      env: testEnv()
    });
    assert.equal(response.status, 200);

    const attributionCall = mock.calls.find(({ href, init }) =>
      href.includes('/customer_attributions') && init.method === 'POST'
    );
    assert.ok(attributionCall);
    assert.equal(JSON.parse(attributionCall.init.body).stage, 'paid');

    const createCalls = mock.calls.filter(({ href, init }) =>
      href.endsWith('/records') && init.method === 'POST'
    );
    assert.equal(createCalls.length, 0);

    const patches = mock.calls
      .filter(({ href, init }) => href.includes('/stripe_webhook_events') && init.method === 'PATCH')
      .map(({ init }) => JSON.parse(init.body));
    assert.ok(patches.some((patch) => patch.feishu_revenue_recorded_at));
  } finally {
    mock.restore();
  }
});

test('new Stripe order creates a Feishu revenue record', async () => {
  const mock = mockFetch({ existingRecord: null });
  try {
    const event = checkoutEvent('evt_new');
    const response = await onRequestPost({ request: await signedRequest(event), env: testEnv() });
    assert.equal(response.status, 200);

    const attributionCall = mock.calls.find(({ href, init }) =>
      href.includes('/customer_attributions') && init.method === 'POST'
    );
    assert.ok(attributionCall);
    const attribution = JSON.parse(attributionCall.init.body);
    assert.equal(attribution.rule_key, 'website_skill_email_9_9');
    assert.equal(attribution.customer_type, '付费订阅');
    assert.deepEqual(attribution.tag_names, ['官网来源', '9.9元技能邮件订阅']);

    const createCall = mock.calls.find(({ href, init }) =>
      href.endsWith('/records') && init.method === 'POST'
    );
    assert.ok(createCall);
    const fields = JSON.parse(createCall.init.body).fields;
    assert.equal(fields['收入金额'], 9.9);
    assert.equal(fields['原币金额'], 9.9);
    assert.equal(fields['币种'], 'CNY');
    assert.equal(fields['收款渠道'], 'Stripe');
    assert.equal(fields['来源渠道'], 'Tech Bridge 官网');
    assert.equal(fields['收入类型'], '内容订阅');
    assert.equal(fields['产品/服务'], 'Tech Bridge 技能邮件订阅');
    assert.equal(fields['订单号'], 'cs_evt_new');
  } finally {
    mock.restore();
  }
});
