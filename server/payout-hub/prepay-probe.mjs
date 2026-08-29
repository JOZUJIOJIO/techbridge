import { createWechatJsapiOrder } from './wechat-jsapi.mjs';

const email = process.env.PROBE_EMAIL;
if (!email || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing_probe_config');

const headers = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
};
const orderResponse = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/skill_store_orders?buyer_email=eq.${encodeURIComponent(email)}&status=eq.pending&select=order_number,gross_amount,currency,expires_at,partner_id&order=created_at.desc&limit=1`,
  { headers }
);
const order = (await orderResponse.json())[0];
if (!order) throw new Error('probe_order_not_found');

const tokenResponse = await fetch(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(process.env.WECHAT_APP_ID)}&secret=${encodeURIComponent(process.env.WECHAT_APP_SECRET)}`
);
const token = await tokenResponse.json();
if (!token.access_token) throw new Error(`wechat_token_failed:${token.errcode || tokenResponse.status}`);
const followersResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(token.access_token)}&next_openid=`);
const followers = await followersResponse.json();
const openid = followers.data?.openid?.[0];
if (!openid) throw new Error(`wechat_follower_openid_unavailable:${followers.errcode || followersResponse.status}`);

const payment = await createWechatJsapiOrder(process.env, order, openid);
console.log(JSON.stringify({ ok: true, amount: order.gross_amount, appId: payment.params.appId, packageReady: payment.params.package.startsWith('prepay_id=') }));
