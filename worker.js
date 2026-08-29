import * as contactInquiry from './functions/api/contact-inquiry.js';
import * as memberSubscription from './functions/api/member-subscription/create.js';
import * as memberSubscriptionStatus from './functions/api/member-subscription/status.js';
import * as memberOnboarding from './functions/api/member-onboarding.js';
import * as stripeWebhook from './functions/api/stripe-webhook.js';
import * as skillPackDownload from './functions/api/skill-pack-download.js';
import * as partnerReferral from './functions/api/partner-referral.js';
import * as partnerQr from './functions/api/partner-qr.js';
import * as partnerPortalSummary from './functions/api/partner-portal-summary.js';
import * as partnerWithdrawal from './functions/api/partner-withdrawal.js';
import * as channelWechatBindTicket from './functions/api/channel-wechat-bind-ticket.js';
import * as analytics from './functions/api/analytics.js';
import * as wechatPayWebhook from './functions/api/wechatpay-webhook.js';
import * as wechatPayTransferWebhook from './functions/api/wechatpay-transfer-webhook.js';
import { runAutomationSync } from './functions/automation-sync.js';
import { runWechatPayReconcile } from './functions/api/wechatpay-webhook.js';
import { runPartnerPayouts } from './functions/partner-payouts.js';
import { runWechatPartnerPayoutReconcile } from './functions/partner-withdrawals.js';

const API_ROUTES = new Map([
  ['/api/contact-inquiry', contactInquiry],
  ['/api/member-subscription/create', memberSubscription],
  ['/api/member-subscription/status', memberSubscriptionStatus],
  ['/api/member-onboarding', memberOnboarding],
  ['/api/analytics', analytics],
  ['/api/stripe-webhook', stripeWebhook],
  ['/api/skill-pack-download', skillPackDownload],
  ['/api/partner-qr', partnerQr],
  ['/api/partner-portal/summary', partnerPortalSummary],
  ['/api/partner-portal/withdraw', partnerWithdrawal],
  ['/api/channel/wechat/bind-ticket', channelWechatBindTicket],
  ['/api/wechatpay-webhook', wechatPayWebhook],
  ['/api/wechatpay-transfer-webhook', wechatPayTransferWebhook]
]);

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === 'www.qiaobit.com') {
      url.protocol = 'https:';
      url.hostname = 'qiaobit.com';
      return Response.redirect(url.toString(), 301);
    }

    if (url.protocol === 'http:' && url.hostname === 'qiaobit.com') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/ByteDanceVerify.html') {
      url.pathname = '/ByteDanceVerify';
      return env.ASSETS.fetch(new Request(url, request));
    }

    const partnerMatch = url.pathname.match(/^\/s\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/?$/);
    if (partnerMatch && request.method === 'GET') {
      return partnerReferral.onRequestGet({ request, env, ctx, partnerCode: partnerMatch[1] });
    }

    const handler = API_ROUTES.get(url.pathname);

    if (!handler) {
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'not_found', message: '接口不存在。' }, 404);
      }
      return env.ASSETS.fetch(request);
    }

    const methodHandler = handler[`onRequest${request.method.charAt(0)}${request.method.slice(1).toLowerCase()}`];
    if (!methodHandler) {
      return json({ error: 'method_not_allowed', message: '请求方法不受支持。' }, 405);
    }

    return methodHandler({ request, env, ctx });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.all([
      runAutomationSync(env),
      runWechatPayReconcile(env),
      runPartnerPayouts(env),
      runWechatPartnerPayoutReconcile(env)
    ]));
  }
};
