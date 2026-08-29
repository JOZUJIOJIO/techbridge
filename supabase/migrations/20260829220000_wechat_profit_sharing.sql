alter table public.distribution_partners
  drop constraint if exists distribution_partners_payout_method_check;

alter table public.distribution_partners
  add constraint distribution_partners_payout_method_check
  check (payout_method in ('manual', 'stripe_connect', 'wechat_balance', 'wechat_profit_sharing'));

alter table public.distribution_partners
  add column if not exists profit_sharing_receiver_status text not null default 'pending'
    check (profit_sharing_receiver_status in ('pending', 'ready', 'failed')),
  add column if not exists profit_sharing_receiver_added_at timestamptz,
  add column if not exists profit_sharing_last_error text;

alter table public.partner_order_commissions
  add column if not exists profit_sharing_order_no text,
  add column if not exists profit_sharing_state text,
  add column if not exists profit_sharing_requested_at timestamptz,
  add column if not exists profit_sharing_completed_at timestamptz;

create unique index if not exists partner_order_commissions_profit_sharing_order_idx
  on public.partner_order_commissions(profit_sharing_order_no)
  where profit_sharing_order_no is not null;

create or replace function public.prepare_wechat_profit_sharing_commission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_provider = 'wechatpay' then
    new.status := 'pending';
    new.eligible_at := now() + interval '1 minute';
    new.profit_sharing_state := 'WAITING_SETTLEMENT';
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_wechat_profit_sharing_commission on public.partner_order_commissions;
create trigger prepare_wechat_profit_sharing_commission
before insert on public.partner_order_commissions
for each row execute function public.prepare_wechat_profit_sharing_commission();

create or replace function public.use_profit_sharing_for_wechat_channel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.wechat_openid is not null and new.wechat_appid is not null then
    new.payout_method := 'wechat_profit_sharing';
    if old.wechat_openid is distinct from new.wechat_openid then
      new.profit_sharing_receiver_status := 'pending';
      new.profit_sharing_receiver_added_at := null;
      new.profit_sharing_last_error := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_partner_profit_sharing_mode on public.distribution_partners;
create trigger distribution_partner_profit_sharing_mode
before update of wechat_openid, wechat_appid on public.distribution_partners
for each row execute function public.use_profit_sharing_for_wechat_channel();

update public.distribution_partners
set payout_method = 'wechat_profit_sharing',
    profit_sharing_receiver_status = 'pending',
    updated_at = now()
where wechat_openid is not null
  and wechat_appid is not null
  and payout_method = 'wechat_balance';
