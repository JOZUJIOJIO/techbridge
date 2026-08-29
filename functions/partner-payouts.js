const STRIPE_API_VERSION = '2026-07-29.dahlia';

function headers(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

function baseUrl(env) {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

async function updateCommission(env, id, patch) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/partner_order_commissions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`partner_payout_update_failed:${response.status}:${await response.text()}`);
}

async function paymentIntent(env, id) {
  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  if (!response.ok) throw new Error(`partner_payment_intent_failed:${response.status}`);
  return response.json();
}

async function createTransfer(env, commission, connectedAccount) {
  const intent = await paymentIntent(env, commission.stripe_payment_intent_id);
  const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) throw new Error('partner_source_charge_missing');

  const body = new URLSearchParams();
  body.set('amount', String(commission.commission_amount));
  body.set('currency', String(commission.currency || 'cny').toLowerCase());
  body.set('destination', connectedAccount);
  body.set('source_transaction', chargeId);
  body.set('transfer_group', `tb_partner_${commission.stripe_checkout_session_id}`.slice(0, 200));
  body.set('metadata[partner_code]', commission.partner_code);
  body.set('metadata[checkout_session]', commission.stripe_checkout_session_id);

  const response = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': STRIPE_API_VERSION,
      'idempotency-key': `partner-payout-${commission.id}`
    },
    body
  });
  const transfer = await response.json().catch(() => ({}));
  if (!response.ok || !transfer.id) {
    throw new Error(`partner_transfer_failed:${transfer.error?.code || response.status}:${transfer.error?.message || ''}`);
  }
  return transfer;
}

export async function runPartnerPayouts(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true, reason: 'missing_supabase_config' };
  }
  const now = new Date().toISOString();
  const params = new URLSearchParams({
    order_provider: 'eq.stripe',
    status: 'in.(pending,eligible)',
    eligible_at: `lte.${now}`,
    select: 'id,partner_id,partner_code,partner_tier,stripe_checkout_session_id,stripe_payment_intent_id,commission_amount,currency,status,distribution_partners!inner(status,payout_method,payouts_enabled,connect_account_id)',
    order: 'eligible_at.asc',
    limit: '50'
  });
  const response = await fetch(`${baseUrl(env)}/rest/v1/partner_order_commissions?${params}`, {
    headers: headers(env)
  });
  if (!response.ok) throw new Error(`partner_payout_queue_failed:${response.status}:${await response.text()}`);
  const commissions = await response.json();
  const results = [];

  for (const commission of commissions) {
    const partner = commission.distribution_partners;
    if (!partner || partner.status !== 'active') {
      results.push({ id: commission.id, skipped: true, reason: 'partner_inactive' });
      continue;
    }

    if (commission.status === 'pending') {
      await updateCommission(env, commission.id, { status: 'eligible', last_error: null });
    }

    const connectReady = env.PARTNER_PAYOUTS_ENABLED === 'true'
      && partner.payout_method === 'stripe_connect'
      && partner.payouts_enabled
      && /^acct_[A-Za-z0-9]+$/.test(String(partner.connect_account_id || ''));
    if (!connectReady) {
      results.push({ id: commission.id, eligible: true, transferred: false });
      continue;
    }

    try {
      await updateCommission(env, commission.id, { status: 'transferring', last_error: null });
      const transfer = await createTransfer(env, commission, partner.connect_account_id);
      await updateCommission(env, commission.id, {
        status: 'transferred',
        transfer_id: transfer.id,
        transferred_at: new Date().toISOString(),
        last_error: null
      });
      results.push({ id: commission.id, transferred: true, transferId: transfer.id });
    } catch (error) {
      await updateCommission(env, commission.id, {
        status: 'eligible',
        last_error: String(error.message || error).slice(0, 500)
      });
      results.push({ id: commission.id, transferred: false, error: error.message });
    }
  }
  return { ok: true, processed: results.length, results };
}
