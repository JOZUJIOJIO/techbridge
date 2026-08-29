import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost as adminAction } from '../functions/api/distribution-admin.js';
import { onRequestGet as inviteStatus, onRequestPost as inviteExchange } from '../functions/api/distribution-invite.js';
import { onRequestGet as productReferral } from '../functions/api/distribution-product-referral.js';

const env = {
  DISTRIBUTION_ADMIN_SECRET: 'owner-secret-long-enough-123456',
  SUPABASE_URL: 'https://supabase.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  PUBLIC_SITE_URL: 'https://qiaobit.com',
  PARTNER_REFERRAL_SECRET: 'referral-secret'
};

test('admin creates a labeled random invitation with a four-digit channel code', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url); calls.push({ href, init });
    if (href.includes('channel_number=eq.')) return Response.json([]);
    if (href.endsWith('/distribution_partners') && init.method === 'POST') return Response.json([{ id: 'channel-id' }]);
    if (href.includes('/distribution_products?status=eq.active')) return Response.json([{ id: 'product-id', default_commission_amount: 19980 }]);
    if (href.includes('/distribution_product_commissions?')) return new Response(null, { status: 201 });
    if (href.endsWith('/distribution_invites') && init.method === 'POST') return Response.json([{ id: 'invite-id', invite_slug: 'A'.repeat(32) }]);
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const response = await adminAction({
      request: new Request('https://qiaobit.com/api/admin/distribution', {
        method: 'POST', headers: { 'x-distribution-admin': env.DISTRIBUTION_ADMIN_SECRET },
        body: JSON.stringify({ action: 'create_invite', recipientLabel: '同行甲' })
      }), env
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(String(data.channelNumber), /^\d{4}$/);
    assert.match(data.inviteUrl, /^https:\/\/qiaobit\.com\/join\//);
    const partnerBody = JSON.parse(calls.find(({ href }) => href.endsWith('/distribution_partners')).init.body);
    assert.equal(partnerBody.display_name, '同行甲');
    assert.equal(partnerBody.commission_amount, 20000);
  } finally { globalThis.fetch = originalFetch; }
});

test('one random invite exchanges into a private earnings session and exposes no OpenID', async () => {
  const originalFetch = globalThis.fetch;
  const slug = 'B'.repeat(32);
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes('/distribution_invites?')) return Response.json([{
      id: 'invite-id', invite_slug: slug, recipient_label: '同行乙', status: 'pending', expires_at: '2026-12-01T00:00:00Z', partner_id: 'channel-id',
      distribution_partners: { id: 'channel-id', partner_code: '4827', channel_number: 4827, status: 'active', portal_enabled: true, wechat_bound_at: null }
    }]);
    if (href.endsWith('/partner_portal_sessions') && init.method === 'POST') return new Response(null, { status: 201 });
    if (href.includes('/distribution_invites?id=eq.invite-id') && init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const statusResponse = await inviteStatus({ request: new Request(`https://qiaobit.com/api/distribution/invite?slug=${slug}`), env });
    const status = await statusResponse.json();
    assert.equal(status.channel.number, 4827);
    assert.equal(JSON.stringify(status).includes('openid'), false);
    const exchangeResponse = await inviteExchange({ request: new Request(`https://qiaobit.com/api/distribution/invite?slug=${slug}`, { method: 'POST' }), env });
    const exchange = await exchangeResponse.json();
    assert.match(exchange.earningsUrl, /^https:\/\/qiaobit\.com\/earnings#token=tbp_/);
  } finally { globalThis.fetch = originalFetch; }
});

test('product referral stores signed attribution and opens the independent landing page', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/distribution_products?')) return Response.json([{ id: 'product-id', slug: 'ai-skills-annual', landing_path: '/skills' }]);
    if (href.includes('/distribution_partners?')) return Response.json([{ id: 'channel-id', partner_code: '4827', display_name: '同行', partner_tier: 'standard', commission_amount: 20000, payout_delay_days: 8, payout_method: 'wechat_balance' }]);
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const response = await productReferral({ request: new Request('https://qiaobit.com/p/ai-skills-annual?ref=4827'), env, productSlug: 'ai-skills-annual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://qiaobit.com/skills?ref=4827');
    assert.match(response.headers.get('set-cookie'), /tb_partner=/);
  } finally { globalThis.fetch = originalFetch; }
});
