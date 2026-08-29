import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  createWechatTransfer,
  decryptWechatCallback,
  queryOperationBalance,
  queryWechatTransfer,
  transferEnabled,
  verifyWechatCallback
} from './wechat-transfer.mjs';

const STATE_TTL_MS = 10 * 60 * 1000;
const API_SIGNATURE_TTL_MS = 5 * 60 * 1000;

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_config:${missing.join(',')}`);
}

function base64url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function hash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function payoutHubSignature(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyPayoutHubRequest(env, request, body, now = Date.now()) {
  const timestamp = String(request.headers.get('x-tb-timestamp') || '');
  const signature = String(request.headers.get('x-tb-signature') || '');
  const millis = /^\d{13}$/.test(timestamp) ? Number(timestamp) : Number.NaN;
  return Boolean(env.PAYOUT_HUB_API_SECRET)
    && Number.isFinite(millis)
    && Math.abs(now - millis) <= API_SIGNATURE_TTL_MS
    && safeEqual(payoutHubSignature(env.PAYOUT_HUB_API_SECRET, timestamp, body), signature);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createOauthState(secret, ticket, now = Date.now()) {
  if (!secret || !/^wbt_[A-Za-z0-9_-]{40,}$/.test(String(ticket || ''))) throw new Error('invalid_oauth_state_input');
  const payload = base64url(JSON.stringify({ ticket, issuedAt: now, nonce: randomBytes(12).toString('hex') }));
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyOauthState(secret, state, now = Date.now()) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature || !safeEqual(sign(secret, payload), signature)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!/^wbt_[A-Za-z0-9_-]{40,}$/.test(String(value.ticket || ''))) return null;
    if (!Number.isFinite(value.issuedAt) || value.issuedAt > now + 60_000 || now - value.issuedAt > STATE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function wechatAuthorizeUrl(env, state) {
  const callback = env.WECHAT_OAUTH_CALLBACK_URL || 'https://siliconstory.cn/techbridge/oauth/callback';
  const params = new URLSearchParams({
    appid: env.WECHAT_APP_ID,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'snsapi_base',
    state
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params}#wechat_redirect`;
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json'
  };
}

function supabaseBase(env) {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

async function validTicket(env, ticket, fetchFn) {
  const params = new URLSearchParams({
    token_hash: `eq.${hash(ticket)}`,
    consumed_at: 'is.null',
    expires_at: `gt.${new Date().toISOString()}`,
    select: 'id',
    limit: '1'
  });
  const response = await fetchFn(`${supabaseBase(env)}/rest/v1/partner_wechat_bind_tickets?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`bind_ticket_lookup_failed:${response.status}`);
  return Boolean((await response.json())[0]);
}

async function exchangeOauthCode(env, code, fetchFn) {
  const params = new URLSearchParams({
    appid: env.WECHAT_APP_ID,
    secret: env.WECHAT_APP_SECRET,
    code,
    grant_type: 'authorization_code'
  });
  const response = await fetchFn(`https://api.weixin.qq.com/sns/oauth2/access_token?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode || !data.openid) {
    throw new Error(`wechat_oauth_exchange_failed:${data.errcode || response.status}`);
  }
  return String(data.openid);
}

async function bindChannel(env, ticket, openid, fetchFn) {
  const response = await fetchFn(`${supabaseBase(env)}/rest/v1/rpc/bind_channel_wechat_identity`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      p_token_hash: hash(ticket),
      p_appid: env.WECHAT_APP_ID,
      p_openid: openid
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`channel_wechat_bind_failed:${data.message || response.status}`);
}

async function payoutRpc(env, name, body, fetchFn) {
  const response = await fetchFn(`${supabaseBase(env)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${name}_failed:${response.status}`);
}

function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

function errorPage(message, status = 400) {
  const text = String(message || '微信绑定未完成').replace(/[<>&"']/g, '');
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信绑定</title><style>body{margin:0;background:#151513;color:#f4f1eb;font-family:system-ui;padding:48px 24px}main{max-width:620px;margin:auto;border:1px solid #3c3934;padding:28px}a{color:#20b8b1}</style><main><h1>微信绑定未完成</h1><p>${text}</p><p><a href="https://qiaobit.com/channel">返回渠道中心</a></p></main>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function createPayoutHubHandler(env = process.env, fetchFn = fetch) {
  required(env, ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'OAUTH_STATE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'techbridge-payout-hub' }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/techbridge/oauth/start') {
      const ticket = url.searchParams.get('ticket') || '';
      if (!/^wbt_[A-Za-z0-9_-]{40,}$/.test(ticket)) return errorPage('渠道邀请无效或已过期。');
      if (!await validTicket(env, ticket, fetchFn)) return errorPage('渠道邀请无效或已过期。');
      return redirect(wechatAuthorizeUrl(env, createOauthState(env.OAUTH_STATE_SECRET, ticket)));
    }

    if (url.pathname === '/techbridge/oauth/callback') {
      const state = verifyOauthState(env.OAUTH_STATE_SECRET, url.searchParams.get('state'));
      const code = url.searchParams.get('code') || '';
      if (!state || !code) return errorPage('微信授权状态无效，请从渠道中心重新发起绑定。');
      try {
        const openid = await exchangeOauthCode(env, code, fetchFn);
        await bindChannel(env, state.ticket, openid, fetchFn);
        const site = String(env.PUBLIC_SITE_URL || 'https://qiaobit.com').replace(/\/$/, '');
        return redirect(`${site}/channel?wechat=bound`);
      } catch (error) {
        console.error(JSON.stringify({ event: 'channel_wechat_oauth_failed', reason: error.message }));
        return errorPage('微信身份绑定失败，请返回渠道中心重新尝试。', 502);
      }
    }

    if (url.pathname === '/techbridge/transfer/create' && request.method === 'POST') {
      const body = await request.text();
      if (!verifyPayoutHubRequest(env, request, body)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (!transferEnabled(env)) return Response.json({ error: 'transfer_disabled' }, { status: 503 });
      try {
        const input = JSON.parse(body);
        return Response.json(await createWechatTransfer(env, input, fetchFn), { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        console.error(JSON.stringify({ event: 'payout_hub_transfer_create_failed', reason: error.message }));
        return Response.json({ error: 'transfer_failed' }, { status: 502 });
      }
    }

    if (url.pathname === '/techbridge/transfer/query' && request.method === 'POST') {
      const body = await request.text();
      if (!verifyPayoutHubRequest(env, request, body)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (!transferEnabled(env)) return Response.json({ error: 'transfer_disabled' }, { status: 503 });
      try {
        const input = JSON.parse(body);
        return Response.json(await queryWechatTransfer(env, input.outBillNo, fetchFn), { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        console.error(JSON.stringify({ event: 'payout_hub_transfer_query_failed', reason: error.message }));
        return Response.json({ error: 'query_failed' }, { status: 502 });
      }
    }

    if (url.pathname === '/techbridge/transfer/balance' && request.method === 'POST') {
      const body = await request.text();
      if (!verifyPayoutHubRequest(env, request, body)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      try {
        return Response.json(await queryOperationBalance(env, fetchFn), { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        console.error(JSON.stringify({ event: 'payout_hub_balance_query_failed', reason: error.message }));
        return Response.json({ error: 'balance_query_failed' }, { status: 502 });
      }
    }

    if (url.pathname === '/techbridge/transfer/callback' && request.method === 'POST') {
      const body = await request.text();
      if (!verifyWechatCallback(env, body, request.headers)) return Response.json({ error: 'invalid_signature' }, { status: 401 });
      try {
        const notification = JSON.parse(body);
        const transfer = decryptWechatCallback(env, notification.resource);
        const outBillNo = String(transfer.out_bill_no || '');
        const state = String(transfer.state || transfer.transfer_bill_state || '').toUpperCase();
        if (!/^TBP[A-Z0-9]{10,29}$/.test(outBillNo)) return Response.json({ error: 'invalid_out_bill_no' }, { status: 400 });
        if (transfer.appid && transfer.appid !== env.WXPAY_TRANSFER_APPID) return Response.json({ error: 'appid_mismatch' }, { status: 403 });
        if (state === 'SUCCESS') {
          await payoutRpc(env, 'complete_partner_payout_request', {
            p_out_bill_no: outBillNo,
            p_external_transfer_id: String(transfer.transfer_bill_no || '')
          }, fetchFn);
        } else if (['FAIL', 'FAILED', 'CANCELLED', 'CANCELED'].includes(state)) {
          await payoutRpc(env, 'release_partner_payout_by_bill_no', {
            p_out_bill_no: outBillNo,
            p_error: String(transfer.fail_reason || transfer.fail_reason_type || state).slice(0, 500),
            p_cancelled: state === 'CANCELLED' || state === 'CANCELED'
          }, fetchFn);
        }
        return new Response(null, { status: 204 });
      } catch (error) {
        console.error(JSON.stringify({ event: 'payout_hub_transfer_callback_failed', reason: error.message }));
        return Response.json({ error: 'callback_failed' }, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  };
}

export function startPayoutHub(env = process.env) {
  const handler = createPayoutHubHandler(env);
  const port = Number(env.PORT || 8792);
  const server = createServer(async (request, response) => {
    const origin = `http://${request.headers.host || `127.0.0.1:${port}`}`;
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        response.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Payload too large');
        return;
      }
      chunks.push(chunk);
    }
    const requestBody = Buffer.concat(chunks);
    const init = {
      method: request.method,
      headers: request.headers,
      ...(!['GET', 'HEAD'].includes(request.method || 'GET') ? { body: requestBody, duplex: 'half' } : {})
    };
    const body = await handler(new Request(new URL(request.url || '/', origin), init));
    response.writeHead(body.status, Object.fromEntries(body.headers));
    response.end(Buffer.from(await body.arrayBuffer()));
  });
  server.listen(port, '127.0.0.1', () => console.log(`techbridge-payout-hub listening on 127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPayoutHub();
}
