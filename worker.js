import * as analytics from './functions/api/analytics.js';
import * as contactInquiry from './functions/api/contact-inquiry.js';

const API_ROUTES = new Map([
  ['/api/analytics', analytics],
  ['/api/contact-inquiry', contactInquiry]
]);

const BLOCKED_ASSET_PREFIXES = [
  '/.trae/', '/.git/', '/.wrangler/', '/.claude/', '/.playwright-cli/',
  '/config/', '/functions/', '/internal/', '/node_modules/', '/qianx-corporate/',
  '/scripts/', '/server/', '/supabase/', '/tests/', '/videos/'
];

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

    if (BLOCKED_ASSET_PREFIXES.some((prefix) => url.pathname.toLowerCase().startsWith(prefix))) {
      return new Response('Not found', {
        status: 404,
        headers: { 'cache-control': 'no-store' }
      });
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

    const method = `onRequest${request.method.charAt(0)}${request.method.slice(1).toLowerCase()}`;
    const methodHandler = handler[method];
    if (!methodHandler) {
      return json({ error: 'method_not_allowed', message: '请求方法不受支持。' }, 405);
    }

    return methodHandler({ request, env, ctx });
  }
};
