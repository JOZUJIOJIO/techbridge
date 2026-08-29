import assert from 'node:assert/strict';
import test from 'node:test';

import { bearerToken, newPortalToken, payoutBillNumber, portalTokenHash } from '../functions/lib/partner-portal.js';
import { onRequestGet as getSummary } from '../functions/api/partner-portal-summary.js';
import { onRequestPost as requestWithdrawal } from '../functions/api/partner-withdrawal.js';

test('creates opaque partner portal tokens and never accepts them from query parameters', () => {
  const token = newPortalToken();
  assert.match(token, /^tbp_[A-Za-z0-9_-]{40,}$/);
  assert.match(portalTokenHash(token), /^[a-f0-9]{64}$/);
  assert.equal(bearerToken(new Request(`https://qiaobit.com/partner-portal.html?token=${token}`)), '');
  assert.equal(bearerToken(new Request('https://qiaobit.com/api/partner-portal/summary', { headers: { authorization: `Bearer ${token}` } })), token);
  assert.match(payoutBillNumber(new Date('2026-08-29T00:00:00Z')), /^TBP20260829[A-F0-9]{16}$/);
});

test('summary scopes commissions to the authenticated partner and returns no customer PII', async () => {
  const token = newPortalToken();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_portal_sessions?')) {
      return Response.json([{
        id: 'session-id',
        partner_id: 'partner-id',
        expires_at: '2026-12-01T00:00:00Z',
        distribution_partners: {
          id: 'partner-id', partner_code: 'future-tech', display_name: '未来科技社群', partner_tier: 'standard',
          commission_amount: 20000, payout_delay_days: 8, payout_method: 'wechat_profit_sharing', portal_enabled: true,
          wechat_openid: 'o12345678901234567890', wechat_appid: 'wx_app', wechat_bound_at: '2026-08-29T00:00:00Z',
          minimum_payout_amount: 10000, profit_sharing_receiver_status: 'ready', status: 'active'
        }
      }]);
    }
    if (href.includes('/partner_order_commissions?')) {
      assert.match(href, /partner_id=eq\.partner-id/);
      return Response.json([{
        id: 'commission-id', stripe_checkout_session_id: 'cs_live_TESTORDER123', gross_amount: 66600,
        commission_amount: 19980, currency: 'cny', status: 'eligible', eligible_at: '2026-08-20T00:00:00Z',
        transferred_at: null, created_at: '2026-08-12T00:00:00Z'
      }]);
    }
    if (href.includes('/distribution_products?')) return Response.json([{
      id: 'product-id', slug: 'ai-skills-annual', name: 'AI Skills 年度买手服务', summary: '年度精选',
      landing_path: '/skills', price_amount: 66600, currency: 'cny', default_commission_amount: 19980,
      poster_eyebrow: 'AI SKILLS', poster_title: 'AI Skills 年度买手服务', poster_subtitle: '年度精选'
    }]);
    if (href.includes('/distribution_product_commissions?')) return Response.json([{ product_id: 'product-id', commission_amount: 19980 }]);
    if (href.includes('/partner_portal_sessions?id=eq.session-id') && init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const background = [];
    const response = await getSummary({
      request: new Request('https://qiaobit.com/api/partner-portal/summary', { headers: { authorization: `Bearer ${token}` } }),
      env: { SUPABASE_URL: 'https://supabase.example.com', SUPABASE_SERVICE_ROLE_KEY: 'service-role', PUBLIC_SITE_URL: 'https://qiaobit.com' },
      ctx: { waitUntil: (promise) => background.push(promise) }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.balance.available.amount, 19980);
    assert.equal(data.balance.nextPayout.amount, 19980);
    assert.equal(data.partner.commission.display, '¥199.80');
    assert.equal(data.orders[0].commission.display, '¥199.80');
    assert.equal(data.products[0].link, 'https://qiaobit.com/p/ai-skills-annual?ref=future-tech');
    assert.equal(JSON.stringify(data).includes('@'), false);
    await Promise.all(background);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('disabled WeChat transfers reject before touching the payout ledger', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('database must not be touched'); };
  try {
    const response = await requestWithdrawal({
      request: new Request('https://qiaobit.com/api/partner-portal/withdraw', { method: 'POST' }),
      env: { WECHATPAY_MERCHANT_TRANSFER_ENABLED: 'false' }
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'withdrawal_not_enabled');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
