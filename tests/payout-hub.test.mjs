import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOauthState,
  createPayoutHubHandler,
  verifyOauthState,
  wechatAuthorizeUrl
} from '../server/payout-hub/index.mjs';

const ticket = `wbt_${'a'.repeat(43)}`;
const env = {
  PUBLIC_SITE_URL: 'https://qiaobit.com',
  WECHAT_APP_ID: 'wxaab68c7822881159',
  WECHAT_APP_SECRET: 'wechat-secret',
  WECHAT_OAUTH_CALLBACK_URL: 'https://siliconstory.cn/techbridge/oauth/callback',
  OAUTH_STATE_SECRET: 'oauth-state-secret-long-enough',
  SUPABASE_URL: 'https://supabase.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role'
};

test('OAuth state is short-lived, signed and bound to a one-time channel ticket', () => {
  const now = Date.UTC(2026, 7, 29);
  const state = createOauthState(env.OAUTH_STATE_SECRET, ticket, now);
  assert.equal(verifyOauthState(env.OAUTH_STATE_SECRET, state, now + 1000).ticket, ticket);
  assert.equal(verifyOauthState(env.OAUTH_STATE_SECRET, `${state}x`, now + 1000), null);
  assert.equal(verifyOauthState(env.OAUTH_STATE_SECRET, state, now + 11 * 60 * 1000), null);
  const url = new URL(wechatAuthorizeUrl(env, state));
  assert.equal(url.searchParams.get('appid'), 'wxaab68c7822881159');
  assert.equal(url.searchParams.get('scope'), 'snsapi_base');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://siliconstory.cn/techbridge/oauth/callback');
});

test('OAuth callback binds the exact invited channel and redirects to its channel center', async () => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes('/partner_wechat_bind_tickets?')) return Response.json([{ id: 'ticket-id' }]);
    if (href.startsWith('https://api.weixin.qq.com/sns/oauth2/access_token?')) return Response.json({ openid: 'o12345678901234567890' });
    if (href.endsWith('/rest/v1/rpc/bind_channel_wechat_identity')) return Response.json({ id: 'channel-id' });
    throw new Error(`Unexpected fetch: ${href}`);
  };
  const handler = createPayoutHubHandler(env, fetchFn);
  const start = await handler(new Request(`https://siliconstory.cn/techbridge/oauth/start?ticket=${ticket}`));
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location'));
  const state = authorize.searchParams.get('state');
  const callback = await handler(new Request(`https://siliconstory.cn/techbridge/oauth/callback?code=oauth-code&state=${encodeURIComponent(state)}`));
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), 'https://qiaobit.com/channel?wechat=bound');
  const bind = calls.find(({ href }) => href.endsWith('/rpc/bind_channel_wechat_identity'));
  const body = JSON.parse(bind.init.body);
  assert.equal(body.p_appid, 'wxaab68c7822881159');
  assert.equal(body.p_openid, 'o12345678901234567890');
  assert.match(body.p_token_hash, /^[a-f0-9]{64}$/);
});
