import { randomBytes, randomInt } from 'node:crypto';

import { distributionAdminAuthorized } from '../lib/distribution-admin.js';
import { money, supabaseBaseUrl, supabaseServiceHeaders } from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function read(env, path) {
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, { headers: supabaseServiceHeaders(env) });
  if (!response.ok) throw new Error(`distribution_admin_read_failed:${response.status}`);
  return response.json();
}

async function write(env, path, body, prefer = 'return=representation') {
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    method: 'POST',
    headers: supabaseServiceHeaders(env, prefer),
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`distribution_admin_write_failed:${response.status}`);
  return data;
}

async function createChannelNumber(env) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = randomInt(1000, 10000);
    const rows = await read(env, `/rest/v1/distribution_partners?channel_number=eq.${value}&select=id&limit=1`);
    if (!rows.length) return value;
  }
  throw new Error('channel_number_exhausted');
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

export async function onRequestGet({ request, env }) {
  if (!await distributionAdminAuthorized(env, request)) return json({ error: 'unauthorized' }, 401);
  try {
    const [products, invites, channels, storeOrders, commissions, payouts] = await Promise.all([
      read(env, '/rest/v1/distribution_products?select=id,slug,name,summary,landing_path,price_amount,currency,default_commission_amount,status,created_at&order=created_at.desc'),
      read(env, '/rest/v1/distribution_invites?select=id,invite_slug,recipient_label,status,expires_at,opened_at,claimed_at,created_at,distribution_partners(id,partner_code,channel_number,wechat_bound_at,status)&order=created_at.desc&limit=200'),
      read(env, '/rest/v1/distribution_partners?select=id,partner_code,channel_number,display_name,recipient_label,status,wechat_bound_at,joined_at,created_at&order=created_at.desc&limit=200'),
      read(env, '/rest/v1/skill_store_orders?select=id,order_number,product_id,partner_id,buyer_email,gross_amount,currency,status,paid_at,created_at,distribution_partners(partner_code,channel_number,display_name)&order=created_at.desc&limit=300'),
      read(env, '/rest/v1/partner_order_commissions?order_provider=eq.wechatpay&select=id,partner_id,partner_code,gross_amount,commission_amount,currency,status,order_reference,created_at,transferred_at&order=created_at.desc&limit=300'),
      read(env, '/rest/v1/partner_payout_requests?select=id,partner_id,amount,currency,status,requested_at,processed_at&order=requested_at.desc&limit=300')
    ]);
    const paidOrders = storeOrders.filter((order) => order.status === 'paid');
    const completedPayouts = payouts.filter((payout) => payout.status === 'success');
    const channelOrders = paidOrders.filter((order) => order.partner_id);
    const commissionMap = new Map(commissions.map((commission) => [commission.order_reference, commission]));
    const orders = storeOrders.map((order) => {
      const commission = commissionMap.get(order.id);
      return {
        id: order.order_number,
        partner_code: order.distribution_partners?.partner_code || null,
        gross_amount: order.gross_amount,
        commission_amount: commission?.commission_amount || 0,
        currency: order.currency,
        status: order.status,
        commission_status: commission?.status || null,
        created_at: order.created_at,
        paid_at: order.paid_at
      };
    });
    const customers = storeOrders.map((order) => ({
      id: order.id,
      email: order.buyer_email,
      plan: 'AI Skills 年度买手服务',
      amount_total: order.gross_amount,
      currency: order.currency,
      partner_code: order.distribution_partners?.partner_code || null,
      source: order.partner_id ? '渠道订单' : '自然订单',
      status: order.status,
      created_at: order.created_at
    }));
    return json({
      success: true,
      metrics: {
        revenue: money(sum(paidOrders, 'gross_amount')),
        payments: paidOrders.length,
        channels: channels.filter((channel) => channel.status === 'active').length,
        customers: new Set(paidOrders.map((order) => order.buyer_email)).size,
        channelRevenue: money(sum(channelOrders, 'gross_amount')),
        commissionLiability: money(sum(commissions.filter((commission) => !['transferred', 'cancelled', 'reversal_required'].includes(commission.status)), 'commission_amount')),
        paidOut: money(sum(completedPayouts, 'amount'))
      },
      products,
      invites,
      channels: channels.map((channel) => ({ ...channel, wechat_openid: undefined, wechatBound: Boolean(channel.wechat_bound_at) })),
      orders,
      customers,
      payouts
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'distribution_admin_summary_failed', reason: error.message }));
    return json({ error: 'summary_failed', message: '分销数据暂时无法读取。' }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await distributionAdminAuthorized(env, request)) return json({ error: 'unauthorized' }, 401);
  const input = await request.json().catch(() => ({}));
  try {
    if (input.action === 'create_invite') {
      const recipientLabel = String(input.recipientLabel || '').trim().slice(0, 80);
      if (!recipientLabel) return json({ error: 'recipient_required' }, 400);
      const channelNumber = await createChannelNumber(env);
      const partnerRows = await write(env, '/rest/v1/distribution_partners', {
        partner_code: String(channelNumber),
        channel_number: channelNumber,
        display_name: recipientLabel,
        recipient_label: recipientLabel,
        partner_tier: 'standard',
        commission_amount: 20_000,
        status: 'active',
        payout_delay_days: 1,
        payout_method: 'wechat_profit_sharing',
        portal_enabled: true,
        minimum_payout_amount: 10_000
      });
      const partner = partnerRows[0];
      const products = await read(env, '/rest/v1/distribution_products?status=eq.active&select=id,default_commission_amount');
      if (products.length) {
        await write(env, '/rest/v1/distribution_product_commissions?on_conflict=partner_id,product_id', products.map((product) => ({
          partner_id: partner.id,
          product_id: product.id,
          commission_amount: product.default_commission_amount,
          status: 'active'
        })), 'resolution=merge-duplicates,return=minimal');
      }
      const inviteSlug = randomBytes(24).toString('base64url');
      const invites = await write(env, '/rest/v1/distribution_invites', {
        invite_slug: inviteSlug,
        recipient_label: recipientLabel,
        partner_id: partner.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      const site = String(env.PUBLIC_SITE_URL || 'https://skills.siliconstory.cn').replace(/\/$/, '');
      return json({ success: true, invite: invites[0], channelNumber, inviteUrl: `${site}/join/${inviteSlug}` });
    }

    if (input.action === 'create_product') {
      const slug = String(input.slug || '').trim().toLowerCase();
      const name = String(input.name || '').trim().slice(0, 100);
      const landingPath = String(input.landingPath || '').trim();
      const priceAmount = Number(input.priceAmount);
      const commissionAmount = Number(input.commissionAmount);
      if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) || !name || !landingPath.startsWith('/') || priceAmount <= 0 || commissionAmount <= 0) {
        return json({ error: 'invalid_product' }, 400);
      }
      const products = await write(env, '/rest/v1/distribution_products', {
        slug, name, summary: String(input.summary || '').slice(0, 300), landing_path: landingPath,
        price_amount: priceAmount, currency: 'cny', default_commission_amount: commissionAmount,
        status: 'active', poster_title: name, poster_subtitle: String(input.summary || '').slice(0, 80)
      });
      return json({ success: true, product: products[0] });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: 'distribution_admin_action_failed', action: input.action, reason: error.message }));
    return json({ error: 'action_failed', message: '操作失败，请检查是否存在重复渠道码或产品。' }, 502);
  }
}
