import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/member-subscription/create.js';
import { createPartnerCookie } from '../functions/lib/partner-program.js';

test('creates a one-time Stripe Checkout session for the founding AI Skills offer', async () => {
  const originalFetch = globalThis.fetch;
  let stripeRequest;
  globalThis.fetch = async (url, init) => {
    stripeRequest = { url: String(url), init };
    return Response.json({ id: 'cs_test_ABC123', url: 'https://checkout.stripe.com/test' });
  };
  try {
    const request = new Request('https://qiaobit.com/api/member-subscription/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.com', source: 'qiaobit-homepage' })
    });
    const response = await onRequestPost({
      request,
      env: {
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_ID_SKILL_EMAIL: 'price_founding_666',
        PUBLIC_SITE_URL: 'https://qiaobit.com'
      }
    });
    assert.equal(response.status, 200);
    const body = new URLSearchParams(stripeRequest.init.body);
    assert.equal(body.get('mode'), 'payment');
    assert.equal(body.get('line_items[0][price]'), 'price_founding_666');
    assert.equal(body.get('metadata[plan]'), 'skill_email_365');
    assert.equal(body.get('metadata[offer]'), 'founding_666');
    assert.equal(body.get('metadata[first_issue]'), '001');
    assert.equal(body.has('payment_method_types[0]'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('adds the chosen partner tier to Checkout and disables coupons', async () => {
  const originalFetch = globalThis.fetch;
  let stripeRequest;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/distribution_partners?')) {
      return Response.json([{
        id: '11111111-1111-4111-8111-111111111111',
        partner_code: 'strategic-one',
        display_name: '战略渠道',
        partner_tier: 'strategic',
        commission_amount: 40_000,
        payout_delay_days: 8,
        payout_method: 'stripe_connect'
      }]);
    }
    stripeRequest = { url: String(url), init };
    return Response.json({ id: 'cs_test_PARTNER', url: 'https://checkout.stripe.com/test' });
  };
  try {
    const secret = 'partner-secret';
    const cookie = await createPartnerCookie(secret, 'strategic-one');
    const request = new Request('https://qiaobit.com/api/member-subscription/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `tb_partner=${encodeURIComponent(cookie)}`
      },
      body: JSON.stringify({ email: 'buyer@example.com' })
    });
    const response = await onRequestPost({
      request,
      env: {
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_ID_SKILL_EMAIL: 'price_founding_666',
        PUBLIC_SITE_URL: 'https://qiaobit.com',
        PARTNER_REFERRAL_SECRET: secret,
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role'
      }
    });
    assert.equal(response.status, 200);
    const body = new URLSearchParams(stripeRequest.init.body);
    assert.equal(body.get('allow_promotion_codes'), 'false');
    assert.equal(body.get('metadata[partner_code]'), 'strategic-one');
    assert.equal(body.get('metadata[partner_tier]'), 'strategic');
    assert.equal(body.get('metadata[partner_commission]'), '40000');
    assert.equal(body.get('metadata[partner_payout_delay]'), '8');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
