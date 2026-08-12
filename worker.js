import * as contactInquiry from './functions/api/contact-inquiry.js';
import * as memberSubscription from './functions/api/member-subscription/create.js';
import * as memberSubscriptionStatus from './functions/api/member-subscription/status.js';
import * as memberOnboarding from './functions/api/member-onboarding.js';
import * as stripeWebhook from './functions/api/stripe-webhook.js';
import { runAutomationSync } from './functions/automation-sync.js';

const API_ROUTES = new Map([
  ['/api/contact-inquiry', contactInquiry],
  ['/api/member-subscription/create', memberSubscription],
  ['/api/member-subscription/status', memberSubscriptionStatus],
  ['/api/member-onboarding', memberOnboarding],
  ['/api/stripe-webhook', stripeWebhook]
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
    ctx.waitUntil(runAutomationSync(env));
  }
};
