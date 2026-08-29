import {
  addProfitSharingReceiver,
  createProfitSharingOrder,
  profitSharingEnabled,
  profitSharingOrderNumber,
  queryProfitSharingOrder,
  receiverAlreadyExists,
  receiverClosed,
  receiverSucceeded,
  settlementPending
} from './wechat-profit-sharing.mjs';

function baseUrl(env) {
  return String(env.SUPABASE_URL || '').replace(/\/$/, '');
}

function headers(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

async function patchRow(env, table, id, patch, fetchFn) {
  const response = await fetchFn(`${baseUrl(env)}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`profit_sharing_${table}_update_failed:${response.status}`);
}

async function orderForCommission(env, commission, fetchFn) {
  const params = new URLSearchParams({
    id: `eq.${commission.order_reference}`,
    select: 'id,status,wechat_transaction_id,paid_at',
    limit: '1'
  });
  const response = await fetchFn(`${baseUrl(env)}/rest/v1/skill_store_orders?${params}`, {
    headers: headers(env)
  });
  if (!response.ok) throw new Error(`profit_sharing_order_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

async function ensureReceiver(env, partner, fetchFn) {
  if (partner.profit_sharing_receiver_status === 'ready') return;
  try {
    await addProfitSharingReceiver(env, partner.wechat_openid, fetchFn);
  } catch (error) {
    if (!receiverAlreadyExists(error)) {
      await patchRow(env, 'distribution_partners', partner.id, {
        profit_sharing_receiver_status: 'failed',
        profit_sharing_last_error: String(error.message || error).slice(0, 500)
      }, fetchFn);
      throw error;
    }
  }
  await patchRow(env, 'distribution_partners', partner.id, {
    payout_method: 'wechat_profit_sharing',
    profit_sharing_receiver_status: 'ready',
    profit_sharing_receiver_added_at: new Date().toISOString(),
    profit_sharing_last_error: null
  }, fetchFn);
}

function receiverState(result, openid) {
  if (receiverSucceeded(result, openid)) return 'success';
  if (receiverClosed(result, openid)) return 'closed';
  return 'processing';
}

async function recordResult(env, commission, partner, result, fetchFn) {
  const state = receiverState(result, partner.wechat_openid);
  if (state === 'success') {
    await patchRow(env, 'partner_order_commissions', commission.id, {
      status: 'transferred',
      transfer_id: result.order_id || commission.transfer_id || null,
      profit_sharing_state: 'FINISHED',
      profit_sharing_completed_at: result.finish_time || new Date().toISOString(),
      transferred_at: result.finish_time || new Date().toISOString(),
      last_error: null
    }, fetchFn);
  } else if (state === 'closed') {
    await patchRow(env, 'partner_order_commissions', commission.id, {
      status: 'eligible',
      profit_sharing_state: 'CLOSED',
      last_error: 'profit_sharing_receiver_closed'
    }, fetchFn);
  } else {
    await patchRow(env, 'partner_order_commissions', commission.id, {
      status: 'transferring',
      transfer_id: result.order_id || commission.transfer_id || null,
      profit_sharing_state: result.state || 'PROCESSING',
      last_error: null
    }, fetchFn);
  }
  return state;
}

async function processCommission(env, commission, fetchFn) {
  const partner = commission.distribution_partners;
  if (!partner || partner.status !== 'active') return { id: commission.id, skipped: true, reason: 'partner_inactive' };
  if (!partner.wechat_openid || partner.wechat_appid !== env.WXPAY_TRANSFER_APPID) {
    return { id: commission.id, skipped: true, reason: 'partner_wechat_not_ready' };
  }
  const order = await orderForCommission(env, commission, fetchFn);
  if (!order?.wechat_transaction_id || order.status !== 'paid') {
    return { id: commission.id, skipped: true, reason: 'paid_order_not_ready' };
  }

  const outOrderNo = commission.profit_sharing_order_no || profitSharingOrderNumber(commission.id);
  if (commission.status === 'transferring') {
    const result = await queryProfitSharingOrder(env, {
      transactionId: order.wechat_transaction_id,
      outOrderNo
    }, fetchFn);
    return { id: commission.id, state: await recordResult(env, commission, partner, result, fetchFn) };
  }

  await ensureReceiver(env, partner, fetchFn);
  try {
    const result = await createProfitSharingOrder(env, {
      transactionId: order.wechat_transaction_id,
      outOrderNo,
      openid: partner.wechat_openid,
      amount: commission.commission_amount
    }, fetchFn);
    await patchRow(env, 'partner_order_commissions', commission.id, {
      status: 'transferring',
      profit_sharing_order_no: outOrderNo,
      profit_sharing_state: result.state || 'PROCESSING',
      profit_sharing_requested_at: new Date().toISOString(),
      transfer_id: result.order_id || null,
      last_error: null
    }, fetchFn);
    return { id: commission.id, state: await recordResult(env, { ...commission, profit_sharing_order_no: outOrderNo }, partner, result, fetchFn) };
  } catch (error) {
    await patchRow(env, 'partner_order_commissions', commission.id, {
      profit_sharing_order_no: outOrderNo,
      profit_sharing_state: settlementPending(error) ? 'WAITING_SETTLEMENT' : 'FAILED',
      last_error: String(error.message || error).slice(0, 500)
    }, fetchFn);
    return { id: commission.id, state: settlementPending(error) ? 'waiting_settlement' : 'failed', error: error.message };
  }
}

export async function runWechatProfitSharing(env, fetchFn = fetch) {
  if (!profitSharingEnabled(env)) return { skipped: true, reason: 'profit_sharing_disabled' };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true, reason: 'missing_supabase_config' };
  }
  const params = new URLSearchParams({
    order_provider: 'eq.wechatpay',
    status: 'in.(pending,transferring)',
    eligible_at: `lte.${new Date().toISOString()}`,
    select: 'id,order_reference,commission_amount,status,transfer_id,profit_sharing_order_no,distribution_partners!inner(id,status,wechat_openid,wechat_appid,profit_sharing_receiver_status)',
    order: 'eligible_at.asc',
    limit: '50'
  });
  const response = await fetchFn(`${baseUrl(env)}/rest/v1/partner_order_commissions?${params}`, {
    headers: headers(env)
  });
  if (!response.ok) throw new Error(`profit_sharing_queue_failed:${response.status}`);
  const commissions = await response.json();
  const results = [];
  for (const commission of commissions) {
    try {
      results.push(await processCommission(env, commission, fetchFn));
    } catch (error) {
      results.push({ id: commission.id, state: 'failed', error: error.message });
    }
  }
  return { processed: results.length, results };
}
