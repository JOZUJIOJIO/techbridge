import { merchantTransferConfigured, queryWechatBalanceTransfer } from './lib/wechatpay-transfer.js';
import { supabaseBaseUrl, supabaseServiceHeaders } from './lib/partner-portal.js';

async function rpc(env, name, body) {
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${name}_failed:${response.status}`);
}

async function saveError(env, id, error) {
  await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_payout_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify({ last_error: String(error).slice(0, 500), updated_at: new Date().toISOString() })
  });
}

export async function runWechatPartnerPayoutReconcile(env) {
  if (!merchantTransferConfigured(env) || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true, reason: 'wechat_transfer_not_configured' };
  }
  const before = new Date(Date.now() - 60_000).toISOString();
  const params = new URLSearchParams({
    status: 'in.(processing,wait_user_confirm)',
    out_bill_no: 'not.is.null',
    requested_at: `lt.${before}`,
    select: 'id,out_bill_no,status',
    order: 'requested_at.asc',
    limit: '20'
  });
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_payout_requests?${params}`, {
    headers: supabaseServiceHeaders(env)
  });
  if (!response.ok) throw new Error(`partner_withdrawal_reconcile_list_failed:${response.status}`);
  const requests = await response.json();
  const results = [];

  for (const request of requests) {
    try {
      const transfer = await queryWechatBalanceTransfer(env, request.out_bill_no);
      if (transfer.state === 'SUCCESS') {
        await rpc(env, 'complete_partner_payout_request', {
          p_out_bill_no: request.out_bill_no,
          p_external_transfer_id: transfer.transferBillNo || ''
        });
      } else if (['FAIL', 'FAILED', 'CANCELLED', 'CANCELED'].includes(transfer.state)) {
        await rpc(env, 'release_partner_payout_by_bill_no', {
          p_out_bill_no: request.out_bill_no,
          p_error: String(transfer.failReason || transfer.state).slice(0, 500),
          p_cancelled: transfer.state === 'CANCELLED' || transfer.state === 'CANCELED'
        });
      }
      results.push({ id: request.id, state: transfer.state });
    } catch (error) {
      await saveError(env, request.id, error.message).catch(() => null);
      results.push({ id: request.id, error: error.message });
    }
  }
  return { ok: true, processed: results.length, results };
}
