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
        amount_total: 66_600,
        currency: 'cny'
      }
    }
  };
}

function partnerCheckoutEvent(id = 'evt_partner', tier = 'strategic') {
  const event = checkoutEvent(id);
  event.data.object.metadata = {
    ...event.data.object.metadata,
    partner_id: '11111111-1111-4111-8111-111111111111',
    partner_code: tier === 'strategic' ? 'strategic-one' : 'channel-one',
    partner_tier: tier,
    partner_commission: tier === 'strategic' ? '40000' : '20000',
    partner_payout_delay: '8'
  };
  return event;
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
    if (href.includes('/rest/v1/partner_order_commissions')) {
      return new Response(null, { status: init.method === 'POST' ? 201 : 204 });
    }
    if (href === 'https://api.resend.com/contacts') {
      return Response.json({ object: 'contact', id: 'contact-id' });
    }
    if (href === 'https://api.resend.com/segments?limit=100') {
      return Response.json({ object: 'list', has_more: false, data: [] });
    }
    if (href === 'https://api.resend.com/segments') {
      return Response.json({ object: 'segment', id: 'segment-auto', name: 'Tech Bridge AI Skills Active' });
    }
    if (href === 'https://api.resend.com/emails') {
      return Response.json({ id: 'email-id' });
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
    assert.equal(attribution.rule_key, 'website_skill_letter_annual');
    assert.equal(attribution.customer_type, '付费订阅');
    assert.deepEqual(attribution.tag_names, ['官网来源', 'AI Skills年度订阅']);

    const createCall = mock.calls.find(({ href, init }) =>
      href.endsWith('/records') && init.method === 'POST'
    );
    assert.ok(createCall);
    const fields = JSON.parse(createCall.init.body).fields;
    assert.equal(fields['收入金额'], 666);
    assert.equal(fields['原币金额'], 666);
    assert.equal(fields['币种'], 'CNY');
    assert.equal(fields['收款渠道'], 'Stripe');
    assert.equal(fields['来源渠道'], 'Tech Bridge 官网');
    assert.equal(fields['收入类型'], '内容订阅');
    assert.equal(fields['产品/服务'], 'Tech Bridge AI Skills 年度买手服务');
    assert.equal(fields['订单号'], 'cs_evt_new');
  } finally {
    mock.restore();
  }
});

test('paid AI Skills order joins the Resend segment and delivers Issue 001', async () => {
  const mock = mockFetch({ existingRecord: null });
  const kv = new Map();
  try {
    const response = await onRequestPost({
      request: await signedRequest(checkoutEvent('evt_resend')),
      env: {
        ...testEnv(),
        RESEND_API_KEY: 're_test',
        SKILL_PACK_DOWNLOAD_SECRET: 'download-secret',
        PUBLIC_SITE_URL: 'https://qiaobit.com',
        SKILL_PACKS: {
          get: async (key) => kv.get(key) || null,
          put: async (key, value) => kv.set(key, value)
        }
      }
    });
    assert.equal(response.status, 200);

    const contactCall = mock.calls.find(({ href }) => href === 'https://api.resend.com/contacts');
    assert.ok(contactCall);
    const contact = JSON.parse(contactCall.init.body);
    assert.equal(contact.email, 'buyer@example.com');
    assert.deepEqual(contact.segments, [{ id: 'segment-auto' }]);
    assert.equal(kv.get('config/resend-skill-letter-segment-id'), 'segment-auto');

    const emailCall = mock.calls.find(({ href }) => href === 'https://api.resend.com/emails');
    assert.ok(emailCall);
    const email = JSON.parse(emailCall.init.body);
    assert.match(email.subject, /Skill Letter 001/);
    assert.equal(email.attachments[0].filename, 'techbridge-skill-pack-001.zip');
    assert.match(email.attachments[0].path, /api\/skill-pack-download\?session_id=cs_evt_resend&token=/);

    const patches = mock.calls
      .filter(({ href, init }) => href.includes('/stripe_webhook_events') && init.method === 'PATCH')
      .map(({ init }) => JSON.parse(init.body));
    assert.ok(patches.some((patch) => patch.resend_contact_synced_at));
    assert.ok(patches.some((patch) => patch.welcome_email_sent_at));
  } finally {
    mock.restore();
  }
});

test('strategic partner order records a fixed CNY 400 cooperation income after payment', async () => {
  const mock = mockFetch({ existingRecord: null });
  try {
    const response = await onRequestPost({
      request: await signedRequest(partnerCheckoutEvent('evt_partner')),
      env: testEnv()
    });
    assert.equal(response.status, 200);

    const commissionCall = mock.calls.find(({ href, init }) =>
      href.includes('/partner_order_commissions') && init.method === 'POST'
    );
    assert.ok(commissionCall);
    const commission = JSON.parse(commissionCall.init.body);
    assert.equal(commission.partner_tier, 'strategic');
    assert.equal(commission.gross_amount, 66_600);
    assert.equal(commission.commission_amount, 40_000);
    assert.equal(commission.platform_gross_amount, 26_600);
    assert.equal(commission.status, 'pending');
    assert.equal(
      Date.parse(commission.eligible_at) - partnerCheckoutEvent('evt_partner').created * 1000,
      8 * 24 * 60 * 60 * 1000
    );
  } finally {
    mock.restore();
  }
});

test('Stripe refund cancels an unpaid partner commission', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/stripe_webhook_events') && init.method === 'POST') return Response.json([], { status: 201 });
    if (href.includes('/stripe_webhook_events') && init.method === 'PATCH') return new Response(null, { status: 204 });
    if (href.includes('/stripe_webhook_events')) return Response.json([{}]);
    if (href.includes('/partner_order_commissions?stripe_payment_intent_id=')) {
      return Response.json([{ id: 'commission-id', status: 'pending', transfer_id: null }]);
    }
    if (href.includes('/partner_order_commissions?id=') && init.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const event = {
      id: 'evt_refund',
      type: 'charge.refunded',
      created: 1784121032,
      data: { object: { payment_intent: 'pi_evt_partner', amount_refunded: 66_600 } }
    };
    const response = await onRequestPost({ request: await signedRequest(event), env: testEnv() });
    assert.equal(response.status, 200);
    const cancellation = calls.find(({ href, init }) =>
      href.includes('/partner_order_commissions?id=') && init.method === 'PATCH'
    );
    assert.ok(cancellation);
    const cancellationBody = JSON.parse(cancellation.init.body);
    assert.equal(cancellationBody.status, 'cancelled');
    assert.equal(cancellationBody.refund_amount, 66_600);
    assert.ok(cancellationBody.cancelled_at);
    assert.ok(cancellationBody.updated_at);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
