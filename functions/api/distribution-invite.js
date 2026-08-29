import { newPortalToken, portalTokenHash, supabaseBaseUrl, supabaseServiceHeaders } from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function slugFrom(request) {
  return String(new URL(request.url).searchParams.get('slug') || '');
}

async function inviteBySlug(env, slug) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(slug)) return null;
  const params = new URLSearchParams({
    invite_slug: `eq.${slug}`,
    select: 'id,invite_slug,recipient_label,status,expires_at,partner_id,distribution_partners(id,partner_code,channel_number,status,portal_enabled,wechat_bound_at)',
    limit: '1'
  });
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/distribution_invites?${params}`, { headers: supabaseServiceHeaders(env) });
  if (!response.ok) throw new Error(`invite_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

export async function onRequestGet({ request, env }) {
  try {
    const invite = await inviteBySlug(env, slugFrom(request));
    if (!invite) return json({ error: 'invite_not_found' }, 404);
    if (Date.parse(invite.expires_at) <= Date.now() && !['claimed', 'revoked'].includes(invite.status)) {
      await fetch(`${supabaseBaseUrl(env)}/rest/v1/distribution_invites?id=eq.${invite.id}`, {
        method: 'PATCH', headers: supabaseServiceHeaders(env), body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() })
      });
      invite.status = 'expired';
    }
    const partner = invite.distribution_partners;
    return json({
      success: true,
      invite: { recipientLabel: invite.recipient_label, status: invite.status, expiresAt: invite.expires_at },
      channel: { number: partner?.channel_number || partner?.partner_code, wechatBound: Boolean(partner?.wechat_bound_at) }
    });
  } catch {
    return json({ error: 'invite_unavailable' }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const slug = slugFrom(request);
    const invite = await inviteBySlug(env, slug);
    const partner = invite?.distribution_partners;
    if (!invite || !partner || ['revoked', 'expired'].includes(invite.status) || Date.parse(invite.expires_at) <= Date.now()) {
      return json({ error: 'invite_invalid', message: '邀请链接无效或已过期。' }, 410);
    }
    if (partner.status !== 'active' || partner.portal_enabled !== true) return json({ error: 'channel_unavailable' }, 409);
    const token = newPortalToken();
    const sessionResponse = await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_portal_sessions`, {
      method: 'POST', headers: supabaseServiceHeaders(env, 'return=minimal'),
      body: JSON.stringify({ partner_id: partner.id, token_hash: portalTokenHash(token), expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() })
    });
    if (!sessionResponse.ok) throw new Error('session_create_failed');
    await fetch(`${supabaseBaseUrl(env)}/rest/v1/distribution_invites?id=eq.${invite.id}`, {
      method: 'PATCH', headers: supabaseServiceHeaders(env),
      body: JSON.stringify({ status: partner.wechat_bound_at ? 'claimed' : 'opened', opened_at: invite.opened_at || new Date().toISOString(), pc_last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    });
    const site = String(env.PUBLIC_SITE_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
    return json({ success: true, channelNumber: partner.channel_number || partner.partner_code, wechatBound: Boolean(partner.wechat_bound_at), earningsUrl: `${site}/earnings#token=${token}` });
  } catch (error) {
    console.error(JSON.stringify({ event: 'distribution_invite_exchange_failed', reason: error.message }));
    return json({ error: 'exchange_failed', message: '邀请登录暂时不可用。' }, 502);
  }
}
