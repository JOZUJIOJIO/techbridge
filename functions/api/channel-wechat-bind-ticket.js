import { randomBytes } from 'node:crypto';

import {
  partnerPortalSession,
  portalTokenHash,
  supabaseBaseUrl,
  supabaseServiceHeaders
} from '../lib/partner-portal.js';

const TICKET_TTL_MS = 10 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function bindTicket() {
  return `wbt_${randomBytes(32).toString('base64url')}`;
}

export async function onRequestPost({ request, env }) {
  if (!env.WECHAT_OAUTH_HUB_URL) {
    return json({ error: 'missing_config', message: '微信绑定服务尚未配置。' }, 503);
  }

  let auth;
  try {
    auth = await partnerPortalSession(env, request);
  } catch (error) {
    console.error(JSON.stringify({ event: 'channel_wechat_ticket_auth_failed', reason: error.message }));
    return json({ error: 'service_unavailable', message: '渠道中心暂时不可用。' }, 503);
  }
  if (!auth) return json({ error: 'unauthorized', message: '专属邀请链接无效或已过期。' }, 401);
  const { session, partner } = auth;
  if (partner.wechat_openid && partner.wechat_appid && partner.wechat_bound_at) {
    return json({ success: true, alreadyBound: true });
  }

  const ticket = bindTicket();
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_wechat_bind_tickets`, {
    method: 'POST',
    headers: supabaseServiceHeaders(env, 'return=minimal'),
    body: JSON.stringify({
      partner_id: partner.id,
      portal_session_id: session.id,
      token_hash: portalTokenHash(ticket),
      expires_at: new Date(Date.now() + TICKET_TTL_MS).toISOString()
    })
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'channel_wechat_ticket_create_failed', status: response.status }));
    return json({ error: 'ticket_failed', message: '微信绑定入口创建失败，请稍后重试。' }, 502);
  }

  const hub = String(env.WECHAT_OAUTH_HUB_URL).replace(/\/$/, '');
  return json({
    success: true,
    expiresIn: Math.floor(TICKET_TTL_MS / 1000),
    authorizeUrl: `${hub}/techbridge/oauth/start?ticket=${encodeURIComponent(ticket)}`
  });
}
