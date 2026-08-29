import assert from 'node:assert/strict';
import test from 'node:test';

import { newPortalToken } from '../functions/lib/partner-portal.js';
import { onRequestPost as createBindTicket } from '../functions/api/channel-wechat-bind-ticket.js';

test('creates a one-time WeChat binding ticket for the invited channel only', async () => {
  const token = newPortalToken();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_portal_sessions?')) {
      return Response.json([{
        id: 'session-id', partner_id: 'channel-id', expires_at: '2026-12-01T00:00:00Z',
        distribution_partners: {
          id: 'channel-id', partner_code: 'channel-alpha', display_name: '渠道甲', partner_tier: 'standard',
          commission_amount: 20000, payout_delay_days: 8, payout_method: 'wechat_balance', portal_enabled: true,
          wechat_openid: null, wechat_appid: null, wechat_bound_at: null, minimum_payout_amount: 10000, status: 'active'
        }
      }]);
    }
    if (href.endsWith('/rest/v1/partner_wechat_bind_tickets') && init.method === 'POST') return new Response(null, { status: 201 });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  try {
    const response = await createBindTicket({
      request: new Request('https://qiaobit.com/api/channel/wechat/bind-ticket', { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
      env: {
        WECHAT_OAUTH_HUB_URL: 'https://siliconstory.cn',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role'
      }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.authorizeUrl, /^https:\/\/siliconstory\.cn\/techbridge\/oauth\/start\?ticket=wbt_/);
    const insert = JSON.parse(calls.find(({ href }) => href.endsWith('/partner_wechat_bind_tickets')).init.body);
    assert.equal(insert.partner_id, 'channel-id');
    assert.equal(insert.portal_session_id, 'session-id');
    assert.match(insert.token_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(insert).includes('wbt_'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
