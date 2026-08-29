alter table public.partner_order_commissions
  drop constraint if exists partner_order_commissions_commission_amount_check;

alter table public.partner_order_commissions
  add constraint partner_order_commissions_commission_amount_check
  check (commission_amount in (19980, 20000, 40000));

update public.distribution_products
set default_commission_amount = 19980,
    updated_at = now()
where slug = 'ai-skills-annual';

update public.distribution_product_commissions rate
set commission_amount = 19980,
    updated_at = now()
from public.distribution_products product
where rate.product_id = product.id
  and product.slug = 'ai-skills-annual'
  and rate.status = 'active';

create or replace function public.complete_skill_store_order(
  p_order_number text,
  p_transaction_id text,
  p_paid_at timestamptz
) returns public.skill_store_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.skill_store_orders;
  v_partner public.distribution_partners;
  v_commission integer;
  v_delay_days integer;
begin
  select * into v_order
  from public.skill_store_orders
  where order_number = p_order_number
  for update;

  if not found then
    raise exception 'skill_store_order_not_found';
  end if;
  if v_order.status = 'paid' then
    if v_order.wechat_transaction_id <> p_transaction_id then
      raise exception 'skill_store_transaction_mismatch';
    end if;
    return v_order;
  end if;
  if v_order.status not in ('pending', 'paying') then
    raise exception 'skill_store_order_not_payable';
  end if;

  update public.skill_store_orders
  set status = 'paid',
      wechat_transaction_id = p_transaction_id,
      paid_at = coalesce(p_paid_at, now()),
      last_error = null,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.paid_subscribers (
    email, status, plan, current_period_end, amount_total, currency, source,
    partner_id, partner_code, partner_tier, partner_commission_amount,
    partner_payout_delay_days, distribution_product_id, payment_provider,
    wechat_order_id, updated_at
  )
  select
    v_order.buyer_email,
    'active',
    'skill_email_365',
    coalesce(v_order.paid_at, now()) + interval '365 days',
    v_order.gross_amount,
    v_order.currency,
    'ai-skills-independent-wechat',
    partner.id,
    partner.partner_code,
    partner.partner_tier,
    coalesce(rate.commission_amount, product.default_commission_amount),
    partner.payout_delay_days,
    product.id,
    'wechatpay',
    v_order.id,
    now()
  from public.distribution_products product
  left join public.distribution_partners partner on partner.id = v_order.partner_id
  left join public.distribution_product_commissions rate
    on rate.partner_id = partner.id
   and rate.product_id = product.id
   and rate.status = 'active'
  where product.id = v_order.product_id
  on conflict (email) do update set
    status = excluded.status,
    plan = excluded.plan,
    current_period_end = excluded.current_period_end,
    amount_total = excluded.amount_total,
    currency = excluded.currency,
    source = excluded.source,
    partner_id = excluded.partner_id,
    partner_code = excluded.partner_code,
    partner_tier = excluded.partner_tier,
    partner_commission_amount = excluded.partner_commission_amount,
    partner_payout_delay_days = excluded.partner_payout_delay_days,
    distribution_product_id = excluded.distribution_product_id,
    payment_provider = excluded.payment_provider,
    wechat_order_id = excluded.wechat_order_id,
    updated_at = now();

  if v_order.partner_id is not null then
    select * into v_partner
    from public.distribution_partners
    where id = v_order.partner_id and status = 'active';

    if found then
      select coalesce(rate.commission_amount, product.default_commission_amount)
      into v_commission
      from public.distribution_products product
      left join public.distribution_product_commissions rate
        on rate.partner_id = v_partner.id
       and rate.product_id = product.id
       and rate.status = 'active'
      where product.id = v_order.product_id;

      v_delay_days := greatest(1, least(30, coalesce(v_partner.payout_delay_days, 8)));
      if v_commission in (19980, 20000, 40000) then
        insert into public.partner_order_commissions (
          partner_id, partner_code, partner_tier, stripe_checkout_session_id,
          gross_amount, commission_amount, platform_gross_amount, currency,
          status, eligible_at, product_id, order_provider, order_reference,
          updated_at
        ) values (
          v_partner.id, v_partner.partner_code, v_partner.partner_tier, null,
          v_order.gross_amount, v_commission, v_order.gross_amount - v_commission,
          v_order.currency, 'pending', coalesce(v_order.paid_at, now()) + make_interval(days => v_delay_days),
          v_order.product_id, 'wechatpay', v_order.id::text, now()
        ) on conflict (order_provider, order_reference) where order_reference is not null
        do nothing;
      end if;
    end if;
  end if;

  return v_order;
end;
$$;

revoke all on function public.complete_skill_store_order(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_skill_store_order(text, text, timestamptz) to service_role;
