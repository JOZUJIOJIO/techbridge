import assert from 'node:assert/strict';
import test from 'node:test';

import { runPartnerPayouts } from '../functions/partner-payouts.js';

function commission(status = 'pending', connect = false) {
  return {
    id: 'commission-id',
    partner_id: 'partner-id',
    partner_code: 'future-tech',
    partner_tier: connect ? 'strategic' : 'standard',
    stripe_checkout_session_id: 'cs_live_PARTNER',
    stripe_payment_intent_id: 'pi_partner',
    commission_amount: connect ? 40_000 : 20_000,
    currency: 'cny',
    status,
    distribution_partners: {
      status: 'active',
      payout_method: connect ? 'stripe_connect' : 'manual',
      payouts_enabled: connect,
      connect_account_id: connect ? 'acct_partner' : null
    }
  };
}

function baseEnv(extra = {}) {
  return {
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'sk_test',
    PARTNER_PAYOUTS_ENABLED: 'false',
    ...extra
  };
}

test('moves a matured manual commission to eligible without transferring funds', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ href: String(url), init });
    if (String(url).includes('/partner_order_commissions?')) return Response.json([commission('pending', false)]);
    if (init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const result = await runPartnerPayouts(baseEnv());
    assert.equal(result.processed, 1);
    assert.equal(result.results[0].eligible, true);
    assert.equal(calls.some(({ href }) => href.includes('api.stripe.com')), false);
    const patch = JSON.parse(calls.find(({ init }) => init.method === 'PATCH').init.body);
    assert.equal(patch.status, 'eligible');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transfers an eligible strategic commission only when Connect payouts are enabled', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_order_commissions?')) return Response.json([commission('eligible', true)]);
    if (href.includes('/payment_intents/')) return Response.json({ latest_charge: 'ch_partner' });
    if (href === 'https://api.stripe.com/v1/transfers') return Response.json({ id: 'tr_partner' });
    if (init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const result = await runPartnerPayouts(baseEnv({ PARTNER_PAYOUTS_ENABLED: 'true' }));
    assert.equal(result.results[0].transferId, 'tr_partner');
    const transferCall = calls.find(({ href }) => href === 'https://api.stripe.com/v1/transfers');
    const body = new URLSearchParams(transferCall.init.body);
    assert.equal(body.get('amount'), '40000');
    assert.equal(body.get('currency'), 'cny');
    assert.equal(body.get('destination'), 'acct_partner');
    assert.equal(body.get('source_transaction'), 'ch_partner');
    const finalPatch = calls.filter(({ init }) => init.method === 'PATCH').map(({ init }) => JSON.parse(init.body)).at(-1);
    assert.equal(finalPatch.status, 'transferred');
    assert.equal(finalPatch.transfer_id, 'tr_partner');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
