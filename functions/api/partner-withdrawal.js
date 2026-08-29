import { createPayoutHubTransfer, payoutHubConfigured } from '../lib/payout-hub-client.js';
import {
  partnerPortalSession,
  payoutBillNumber,
  supabaseBaseUrl,
  supabaseServiceHeaders
} from '../lib/partner-portal.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function rpc(env, name, body) {
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseServiceHeaders(env),
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${name}_failed:${data.message || response.status}`);
  return Array.isArray(data) ? data[0] : data;
}

async function updateRequest(env, id, patch) {
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/partner_payout_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(env, 'return=representation'),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`partner_payout_request_update_failed:${response.status}`);
  return (await response.json())[0];
}

export async function onRequestPost({ request, env }) {
  if (!payoutHubConfigured(env)) {
    return json({
      error: 'withdrawal_not_enabled',
      message: '微信零钱提现正在配置中，当前不会创建或锁定提现单。'
    }, 503);
  }

  let auth;
  try {
    auth = await partnerPortalSession(env, request);
  } catch (error) {
    console.error(JSON.stringify({ event: 'partner_withdrawal_auth_failed', reason: error.message }));
    return json({ error: 'service_unavailable', message: '提现服务暂时不可用。' }, 503);
  }
  if (!auth) return json({ error: 'unauthorized', message: '专属访问链接无效或已过期。' }, 401);
  const { partner } = auth;
  if (partner.partner_tier !== 'standard' || Number(partner.commission_amount) !== 20_000) {
    return json({ error: 'wechat_standard_only', message: '当前仅支持标准渠道的 ¥200 微信结算。' }, 409);
  }
  if (partner.payout_method !== 'wechat_balance') {
    return json({ error: 'payout_method_mismatch', message: '该账户没有启用微信零钱提现。' }, 409);
  }
  if (!partner.wechat_openid || partner.wechat_appid !== env.WECHATPAY_TRANSFER_APP_ID) {
    return json({ error: 'wechat_not_bound', message: '请先在微信内完成身份绑定。' }, 409);
  }

  const body = await request.json().catch(() => ({}));
  const idempotencyKey = String(body.idempotencyKey || '');
  if (!/^wd_[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
    return json({ error: 'invalid_idempotency_key', message: '提现请求参数无效。' }, 400);
  }

  let payoutRequest;
  let transferAttempted = false;
  try {
    payoutRequest = await rpc(env, 'create_partner_payout_request', {
      p_partner_id: partner.id,
      p_payout_method: 'wechat_balance',
      p_idempotency_key: idempotencyKey,
      p_max_amount: 20_000
    });
    if (!payoutRequest?.id) throw new Error('payout_request_missing');

    if (payoutRequest.status === 'wait_user_confirm' && payoutRequest.package_info) {
      return json({
        success: true,
        requestId: payoutRequest.id,
        amount: payoutRequest.amount,
        appId: env.WECHATPAY_TRANSFER_APP_ID,
        merchantId: env.WECHATPAY_MCHID,
        packageInfo: payoutRequest.package_info,
        state: payoutRequest.status
      });
    }
    if (payoutRequest.status !== 'requested') {
      return json({ success: true, requestId: payoutRequest.id, state: payoutRequest.status });
    }

    const outBillNo = payoutBillNumber();
    payoutRequest = await updateRequest(env, payoutRequest.id, {
      status: 'processing',
      out_bill_no: outBillNo,
      last_error: null
    });
    transferAttempted = true;
    const transfer = await createPayoutHubTransfer(env, {
      outBillNo,
      openid: partner.wechat_openid,
      amount: Number(payoutRequest.amount),
      remark: `Tech Bridge ${partner.partner_code} 合作收入`
    });
    await updateRequest(env, payoutRequest.id, {
      status: 'wait_user_confirm',
      external_transfer_id: transfer.transferBillNo,
      package_info: transfer.packageInfo,
      last_error: null
    });
    return json({
      success: true,
      requestId: payoutRequest.id,
      amount: payoutRequest.amount,
      appId: transfer.appId,
      merchantId: transfer.merchantId,
      packageInfo: transfer.packageInfo,
      state: 'wait_user_confirm'
    });
  } catch (error) {
    if (payoutRequest?.id && !transferAttempted) {
      await rpc(env, 'release_partner_payout_request', {
        p_request_id: payoutRequest.id,
        p_error: String(error.message || error).slice(0, 500)
      }).catch(() => null);
    } else if (payoutRequest?.id) {
      await updateRequest(env, payoutRequest.id, {
        last_error: String(error.message || error).slice(0, 500)
      }).catch(() => null);
    }
    const reason = String(error.message || error);
    if (reason.includes('minimum_payout_not_reached')) {
      return json({ error: 'minimum_payout_not_reached', message: '当前可提现金额未达到最低提现额。' }, 409);
    }
    console.error(JSON.stringify({ event: 'partner_withdrawal_failed', partnerId: partner.id, reason }));
    return json({ error: 'withdrawal_failed', message: '提现申请创建失败，请稍后重试。' }, 502);
  }
}
