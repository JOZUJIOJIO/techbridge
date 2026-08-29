import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
import { createWechatJsapiOrder, createWechatJsapiParams } from './wechat-jsapi.mjs';
import { runWechatProfitSharing } from './profit-sharing-jobs.mjs';
import * as channelPayoutConfirm from '../../functions/api/channel-payout-confirm.js';
import * as channelWechatBindTicket from '../../functions/api/channel-wechat-bind-ticket.js';
import * as distributionAdmin from '../../functions/api/distribution-admin.js';
import * as distributionInvite from '../../functions/api/distribution-invite.js';
import * as distributionInviteQr from '../../functions/api/distribution-invite-qr.js';
import * as distributionProductQr from '../../functions/api/distribution-product-qr.js';
import * as distributionProductReferral from '../../functions/api/distribution-product-referral.js';
import * as partnerPortalSummary from '../../functions/api/partner-portal-summary.js';
import * as partnerWithdrawal from '../../functions/api/partner-withdrawal.js';
import { runPartnerPayouts } from '../../functions/partner-payouts.js';
import { runWechatPartnerPayoutReconcile } from '../../functions/partner-withdrawals.js';
import * as skillStoreDownload from '../../functions/api/skill-store-download.js';
import * as skillStoreOrderApi from '../../functions/api/skill-store-order.js';
import * as skillStoreOrderQr from '../../functions/api/skill-store-order-qr.js';
import * as skillStoreWechatNotify from '../../functions/api/skill-store-wechat-notify.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const API_SIGNATURE_TTL_MS = 5 * 60 * 1000;
const PAYMENT_TOKEN_PATTERN = /^wpo_[A-Za-z0-9_-]{43}$/;
const BACKGROUND_JOB_INTERVAL_MS = 5 * 60 * 1000;
const SITE_API_ROUTES = new Map([
  ['/api/skill-store/order', skillStoreOrderApi],
  ['/api/skill-store/order-qr', skillStoreOrderQr],
  ['/api/skill-store/wechat-notify', skillStoreWechatNotify],
  ['/api/skill-store/download', skillStoreDownload],
  ['/api/admin/distribution', distributionAdmin],
  ['/api/distribution/invite', distributionInvite],
  ['/api/distribution/invite-qr', distributionInviteQr],
  ['/api/distribution/product-qr', distributionProductQr],
  ['/api/partner-portal/summary', partnerPortalSummary],
  ['/api/partner-portal/withdraw', partnerWithdrawal],
  ['/api/channel/wechat/bind-ticket', channelWechatBindTicket],
  ['/api/channel/payout/confirm', channelPayoutConfirm]
]);

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

export function createPaymentOauthState(secret, ticket, now = Date.now()) {
  if (!secret || !PAYMENT_TOKEN_PATTERN.test(String(ticket || ''))) throw new Error('invalid_payment_oauth_state_input');
  const timestamp = Math.floor(now / 1000).toString(36);
  const payload = `${ticket}.${timestamp}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyPaymentOauthState(secret, state, now = Date.now()) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return null;
  const [ticket, timestamp, signature] = parts;
  if (!PAYMENT_TOKEN_PATTERN.test(ticket) || !/^[a-z0-9]{6,10}$/.test(timestamp || '')) return null;
  const issuedAt = Number.parseInt(timestamp, 36) * 1000;
  const payload = `${ticket}.${timestamp}`;
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > STATE_TTL_MS) return null;
  return safeEqual(sign(secret, payload), signature) ? { ticket, issuedAt } : null;
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

export function wechatPaymentAuthorizeUrl(env, state) {
  const callback = env.WXPAY_PAYMENT_OAUTH_CALLBACK_URL || 'https://siliconstory.cn/techbridge/pay/callback';
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

async function siteApiEnvironment(env) {
  const productUrl = new URL(env.SKILL_STORE_PUBLIC_URL || 'https://skills.siliconstory.cn/skills');
  const publicSite = productUrl.origin;
  const platformPublicKey = env.WXPAY_PUBLIC_KEY
    || await readFile(env.WXPAY_PUBLIC_KEY_PATH, 'utf8');
  const packPath = env.SKILL_PACK_ISSUE_001_PATH || '/opt/techbridge-payout-hub/assets/techbridge-skill-pack-001.zip';
  const packKey = env.SKILL_PACK_ISSUE_001_KEY || 'issue-001/techbridge-skill-pack-001.zip';
  return {
    ...env,
    PUBLIC_SITE_URL: publicSite,
    SKILL_STORE_PUBLIC_URL: productUrl.toString().replace(/\/$/, ''),
    WECHAT_OAUTH_HUB_URL: publicSite,
    PAYOUT_HUB_URL: publicSite,
    PARTNER_REFERRAL_SECRET: env.PARTNER_REFERRAL_SECRET || env.OAUTH_STATE_SECRET,
    WECHATPAY_MCHID: env.WXPAY_MCHID,
    WECHATPAY_TRANSFER_APP_ID: env.WXPAY_TRANSFER_APPID,
    WECHATPAY_API_V3_KEY: env.WXPAY_API_V3_KEY,
    WECHATPAY_PLATFORM_CERT_PEM: platformPublicKey,
    WECHATPAY_MERCHANT_TRANSFER_ENABLED: env.WXPAY_TRANSFER_ENABLED,
    SKILL_PACK_ISSUE_001_KEY: packKey,
    SKILL_PACKS: {
      async getWithMetadata(key) {
        if (key !== packKey) return null;
        const value = await readFile(packPath);
        return { value, metadata: { contentType: 'application/zip' } };
      }
    }
  };
}

function apiError(message, status = 500) {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

async function dispatchSiteApi(request, env) {
  const url = new URL(request.url);
  const productMatch = url.pathname.match(/^\/p\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])\/?$/);
  const siteEnv = await siteApiEnvironment(env);
  if (productMatch && request.method === 'GET') {
    return distributionProductReferral.onRequestGet({ request, env: siteEnv, productSlug: productMatch[1] });
  }
  const handler = SITE_API_ROUTES.get(url.pathname);
  if (!handler) return null;
  const method = `onRequest${request.method.charAt(0)}${request.method.slice(1).toLowerCase()}`;
  if (!handler[method]) return apiError('method_not_allowed', 405);
  const ctx = {
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) => console.error(JSON.stringify({ event: 'site_api_background_failed', reason: error.message })));
    }
  };
  return handler[method]({ request, env: siteEnv, ctx });
}

async function runDomesticBackgroundJobs(env) {
  const siteEnv = await siteApiEnvironment(env);
  const jobs = await Promise.allSettled([
    runPartnerPayouts(siteEnv),
    runWechatPartnerPayoutReconcile(siteEnv),
    runWechatProfitSharing(siteEnv)
  ]);
  for (const job of jobs) {
    if (job.status === 'rejected') {
      console.error(JSON.stringify({ event: 'domestic_background_job_failed', reason: job.reason?.message || String(job.reason) }));
    }
  }
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

async function skillStoreOrder(env, ticket, fetchFn) {
  if (!PAYMENT_TOKEN_PATTERN.test(String(ticket || ''))) return null;
  const params = new URLSearchParams({
    order_token_hash: `eq.${hash(ticket)}`,
    select: 'id,order_number,buyer_email,gross_amount,currency,status,wechat_prepay_id,expires_at,paid_at,partner_id',
    limit: '1'
  });
  const response = await fetchFn(`${supabaseBase(env)}/rest/v1/skill_store_orders?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`skill_store_order_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

async function updateSkillStoreOrder(env, orderId, patch, fetchFn) {
  const response = await fetchFn(`${supabaseBase(env)}/rest/v1/skill_store_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`skill_store_order_update_failed:${response.status}`);
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

function skillStoreResultUrl(env, ticket, state = 'processing') {
  const destination = new URL(env.SKILL_STORE_PUBLIC_URL || 'https://skills.siliconstory.cn/skills');
  destination.searchParams.set('payment', state);
  destination.searchParams.set('order', ticket);
  return destination.toString();
}

function paymentPage(params, successUrl) {
  const safeParams = JSON.stringify(params).replace(/</g, '\\u003c');
  const safeSuccess = JSON.stringify(successUrl).replace(/</g, '\\u003c');
  return new Response(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>微信支付 · AI Skills</title>
<style>html{background:#151513;color:#f4f1eb;font-family:system-ui,"Noto Sans SC",sans-serif}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}main{width:min(100%,520px);border:1px solid #3d3a35;border-top-color:#f15d22;padding:30px;box-sizing:border-box;background:#1d1d1a}small{color:#20b8b1;font:11px ui-monospace,monospace}h1{font-size:30px;margin:16px 0 10px}p{color:#aaa39a;line-height:1.75}button{width:100%;height:54px;margin-top:20px;border:0;border-radius:4px;background:#f15d22;color:#fff;font-weight:800;font-size:16px}button:disabled{opacity:.55}#state{font-size:12px;color:#20b8b1}</style></head>
<body><main><small>AI SKILLS · WECHAT PAY</small><h1>微信支付 ¥666</h1><p>完成支付后，第 001 期与后续买手信将发送到订单邮箱。</p><button id="pay">确认微信支付</button><p id="state">正在准备安全支付…</p></main>
<script>
const payParams=${safeParams};const successUrl=${safeSuccess};const button=document.getElementById('pay');const state=document.getElementById('state');
function invoke(){button.disabled=true;state.textContent='正在调起微信支付…';WeixinJSBridge.invoke('getBrandWCPayRequest',payParams,function(result){const message=String(result.err_msg||'');if(message==='get_brand_wcpay_request:ok'){state.textContent='支付完成，正在确认订单…';location.replace(successUrl);return}button.disabled=false;state.textContent=message.includes(':cancel')?'你已取消支付，可重新发起。':'支付未完成，请重试。'})}
button.addEventListener('click',function(){if(typeof WeixinJSBridge==='undefined'){state.textContent='请在微信中打开此页面。';return}invoke()});
if(typeof WeixinJSBridge==='undefined'){document.addEventListener('WeixinJSBridgeReady',invoke,{once:true})}else{setTimeout(invoke,160)}
</script></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' }
  });
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
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信绑定</title><style>body{margin:0;background:#151513;color:#f4f1eb;font-family:system-ui;padding:48px 24px}main{max-width:620px;margin:auto;border:1px solid #3c3934;padding:28px}a{color:#20b8b1}</style><main><h1>微信绑定未完成</h1><p>${text}</p><p><a href="https://skills.siliconstory.cn/earnings">返回 AI 产品收益中心</a></p></main>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function paymentErrorPage(message, status = 400) {
  const text = String(message || '微信支付未完成').replace(/[<>&"']/g, '');
  const productUrl = 'https://skills.siliconstory.cn/skills';
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信支付</title><style>body{margin:0;background:#151513;color:#f4f1eb;font-family:system-ui;padding:48px 24px}main{max-width:620px;margin:auto;border:1px solid #3c3934;border-top-color:#f15d22;padding:28px}a{color:#20b8b1}</style><main><h1>微信支付未完成</h1><p>${text}</p><p><a href="${productUrl}">返回 AI Skills 商品页</a></p></main>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function createPayoutHubHandler(env = process.env, fetchFn = fetch) {
  required(env, ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'OAUTH_STATE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/p/')) {
      try {
        const response = await dispatchSiteApi(request, env);
        if (response) return response;
      } catch (error) {
        console.error(JSON.stringify({ event: 'site_api_dispatch_failed', path: url.pathname, reason: error.message }));
        return apiError('service_unavailable', 503);
      }
    }
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'techbridge-payout-hub' }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/techbridge/pay/start') {
      const ticket = url.searchParams.get('ticket') || '';
      try {
        const order = await skillStoreOrder(env, ticket, fetchFn);
        if (!order) return paymentErrorPage('支付订单无效或已过期。');
        if (order.status === 'paid') return redirect(skillStoreResultUrl(env, ticket, 'success'));
        if (!['pending', 'paying'].includes(order.status) || Date.parse(order.expires_at) <= Date.now()) {
          return paymentErrorPage('支付订单已过期，请返回商品页面重新下单。');
        }
        if (env.WECHAT_APP_ID !== env.WXPAY_TRANSFER_APPID) return paymentErrorPage('微信支付 AppID 配置不一致。', 503);
        return redirect(wechatPaymentAuthorizeUrl(env, createPaymentOauthState(env.OAUTH_STATE_SECRET, ticket)));
      } catch (error) {
        console.error(JSON.stringify({ event: 'skill_store_payment_start_failed', reason: error.message }));
        return paymentErrorPage('微信支付暂时无法发起，请稍后重试。', 502);
      }
    }

    if (url.pathname === '/techbridge/pay/callback') {
      const state = verifyPaymentOauthState(env.OAUTH_STATE_SECRET, url.searchParams.get('state'));
      const code = url.searchParams.get('code') || '';
      if (!state || !code) return paymentErrorPage('微信支付授权状态无效，请重新下单。');
      let order;
      try {
        order = await skillStoreOrder(env, state.ticket, fetchFn);
        if (!order) return paymentErrorPage('支付订单不存在。');
        if (order.status === 'paid') return redirect(skillStoreResultUrl(env, state.ticket, 'success'));
        if (!['pending', 'paying'].includes(order.status) || Date.parse(order.expires_at) <= Date.now()) {
          return paymentErrorPage('支付订单已过期，请返回商品页面重新下单。');
        }
        const openid = await exchangeOauthCode(env, code, fetchFn);
        const payment = order.wechat_prepay_id
          ? { prepayId: order.wechat_prepay_id, params: createWechatJsapiParams(env, order.wechat_prepay_id) }
          : await createWechatJsapiOrder(env, order, openid, fetchFn);
        if (!order.wechat_prepay_id) {
          await updateSkillStoreOrder(env, order.id, { status: 'paying', wechat_prepay_id: payment.prepayId, last_error: null }, fetchFn);
        }
        return paymentPage(payment.params, skillStoreResultUrl(env, state.ticket));
      } catch (error) {
        if (order?.id) await updateSkillStoreOrder(env, order.id, { last_error: String(error.message || error).slice(0, 500) }, fetchFn).catch(() => null);
        console.error(JSON.stringify({ event: 'skill_store_payment_callback_failed', reason: error.message }));
        return paymentErrorPage('微信支付创建失败，请返回商品页面重新尝试。', 502);
      }
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
        const site = String(env.PUBLIC_SITE_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
        return redirect(`${site}/earnings?wechat=bound`);
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
    const forwardedProto = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const origin = `${forwardedProto === 'https' ? 'https' : 'http'}://${request.headers.host || `127.0.0.1:${port}`}`;
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
  const firstRun = setTimeout(() => runDomesticBackgroundJobs(env).catch((error) => {
    console.error(JSON.stringify({ event: 'domestic_background_boot_failed', reason: error.message }));
  }), 10_000);
  firstRun.unref();
  const interval = setInterval(() => runDomesticBackgroundJobs(env).catch((error) => {
    console.error(JSON.stringify({ event: 'domestic_background_tick_failed', reason: error.message }));
  }), Number(env.BACKGROUND_JOB_INTERVAL_MS || BACKGROUND_JOB_INTERVAL_MS));
  interval.unref();
  server.on('close', () => {
    clearTimeout(firstRun);
    clearInterval(interval);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPayoutHub();
}
