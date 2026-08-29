alter table public.distribution_partners
  drop constraint if exists distribution_partners_payout_method_check;

alter table public.distribution_partners
  add constraint distribution_partners_payout_method_check
  check (payout_method in ('manual', 'stripe_connect', 'wechat_balance'));

alter table public.distribution_partners
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists wechat_openid text,
  add column if not exists wechat_appid text,
  add column if not exists wechat_bound_at timestamptz,
  add column if not exists minimum_payout_amount integer not null default 10000
    check (minimum_payout_amount between 100 and 10000000),
  add column if not exists auto_payout_enabled boolean not null default false,
  add column if not exists wechat_authorization_id text,
  add column if not exists wechat_authorization_state text
    check (wechat_authorization_state in ('pending', 'active', 'closed') or wechat_authorization_state is null);

create table if not exists public.partner_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.distribution_partners(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_wechat_bind_tickets (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.distribution_partners(id) on delete cascade,
  portal_session_id uuid not null references public.partner_portal_sessions(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_payout_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.distribution_partners(id),
  idempotency_key text not null unique,
  payout_method text not null check (payout_method in ('manual', 'stripe_connect', 'wechat_balance')),
  amount integer not null check (amount > 0),
  currency text not null default 'cny',
  status text not null default 'requested' check (
    status in ('requested', 'processing', 'wait_user_confirm', 'success', 'failed', 'cancelled')
  ),
  out_bill_no text unique,
  external_transfer_id text,
  package_info text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_payout_allocations (
  payout_request_id uuid not null references public.partner_payout_requests(id) on delete cascade,
  commission_id uuid not null unique references public.partner_order_commissions(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (payout_request_id, commission_id)
);

create index if not exists partner_portal_sessions_partner_idx
  on public.partner_portal_sessions(partner_id, expires_at desc);
create index if not exists partner_wechat_bind_tickets_partner_idx
  on public.partner_wechat_bind_tickets(partner_id, expires_at desc)
  where consumed_at is null;
create index if not exists partner_payout_requests_partner_idx
  on public.partner_payout_requests(partner_id, requested_at desc);
create index if not exists partner_payout_requests_status_idx
  on public.partner_payout_requests(status, requested_at)
  where status in ('requested', 'processing', 'wait_user_confirm');

create or replace function public.create_partner_payout_request(
  p_partner_id uuid,
  p_payout_method text,
  p_idempotency_key text,
  p_max_amount integer default 20000
) returns public.partner_payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.distribution_partners;
  v_request public.partner_payout_requests;
  v_amount integer;
  v_commission_ids uuid[];
begin
  select * into v_partner
  from public.distribution_partners
  where id = p_partner_id and status = 'active' and portal_enabled = true
  for update;

  if not found then
    raise exception 'partner_not_available';
  end if;
  if p_payout_method <> v_partner.payout_method then
    raise exception 'payout_method_mismatch';
  end if;
  if p_max_amount is null or p_max_amount <= 0 then
    raise exception 'invalid_payout_max_amount';
  end if;

  select * into v_request
  from public.partner_payout_requests
  where idempotency_key = p_idempotency_key;
  if found then
    return v_request;
  end if;

  select coalesce(sum(locked.commission_amount), 0)::integer,
         coalesce(array_agg(locked.id), '{}'::uuid[])
  into v_amount, v_commission_ids
  from (
    select c.id, c.commission_amount
    from public.partner_order_commissions c
    where c.partner_id = p_partner_id
      and c.status = 'eligible'
      and c.eligible_at <= now()
      and c.commission_amount <= p_max_amount
      and not exists (
        select 1 from public.partner_payout_allocations a
        where a.commission_id = c.id
      )
    order by c.eligible_at asc, c.created_at asc
    limit 1
    for update of c skip locked
  ) locked;

  if v_amount < v_partner.minimum_payout_amount then
    raise exception 'minimum_payout_not_reached';
  end if;

  insert into public.partner_payout_requests (
    partner_id, idempotency_key, payout_method, amount, currency, status
  ) values (
    p_partner_id, p_idempotency_key, p_payout_method, v_amount, 'cny', 'requested'
  )
  returning * into v_request;

  insert into public.partner_payout_allocations (payout_request_id, commission_id, amount)
  select v_request.id, id, commission_amount
  from public.partner_order_commissions
  where id = any(v_commission_ids)
  on conflict (commission_id) do nothing;

  update public.partner_order_commissions c
  set status = 'transferring', updated_at = now()
  where c.id = any(v_commission_ids);

  return v_request;
end;
$$;

revoke all on function public.create_partner_payout_request(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_partner_payout_request(uuid, text, text, integer) to service_role;

create or replace function public.release_partner_payout_request(
  p_request_id uuid,
  p_error text
) returns public.partner_payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.partner_payout_requests;
begin
  select * into v_request
  from public.partner_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'payout_request_not_found';
  end if;
  if v_request.status = 'success' then
    return v_request;
  end if;

  update public.partner_order_commissions c
  set status = 'eligible',
      last_error = left(coalesce(p_error, 'payout_failed'), 500),
      updated_at = now()
  from public.partner_payout_allocations a
  where a.payout_request_id = v_request.id
    and a.commission_id = c.id
    and c.status = 'transferring';

  delete from public.partner_payout_allocations
  where payout_request_id = v_request.id;

  update public.partner_payout_requests
  set status = 'failed',
      last_error = left(coalesce(p_error, 'payout_failed'), 500),
      processed_at = now(),
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.release_partner_payout_by_bill_no(
  p_out_bill_no text,
  p_error text,
  p_cancelled boolean default false
) returns public.partner_payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.partner_payout_requests;
begin
  select * into v_request
  from public.partner_payout_requests
  where out_bill_no = p_out_bill_no
  for update;

  if not found then
    raise exception 'payout_request_not_found';
  end if;
  if v_request.status = 'success' then
    return v_request;
  end if;

  update public.partner_order_commissions c
  set status = 'eligible',
      last_error = left(coalesce(p_error, 'payout_failed'), 500),
      updated_at = now()
  from public.partner_payout_allocations a
  where a.payout_request_id = v_request.id
    and a.commission_id = c.id
    and c.status = 'transferring';

  delete from public.partner_payout_allocations
  where payout_request_id = v_request.id;

  update public.partner_payout_requests
  set status = case when p_cancelled then 'cancelled' else 'failed' end,
      last_error = left(coalesce(p_error, 'payout_failed'), 500),
      processed_at = now(),
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.complete_partner_payout_request(
  p_out_bill_no text,
  p_external_transfer_id text
) returns public.partner_payout_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.partner_payout_requests;
begin
  select * into v_request
  from public.partner_payout_requests
  where out_bill_no = p_out_bill_no
  for update;

  if not found then
    raise exception 'payout_request_not_found';
  end if;
  if v_request.status = 'success' then
    return v_request;
  end if;

  update public.partner_order_commissions c
  set status = 'transferred',
      transfer_id = p_external_transfer_id,
      transferred_at = now(),
      last_error = null,
      updated_at = now()
  from public.partner_payout_allocations a
  where a.payout_request_id = v_request.id
    and a.commission_id = c.id
    and c.status = 'transferring';

  update public.partner_payout_requests
  set status = 'success',
      external_transfer_id = coalesce(nullif(p_external_transfer_id, ''), external_transfer_id),
      processed_at = now(),
      last_error = null,
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.release_partner_payout_request(uuid, text) from public, anon, authenticated;
revoke all on function public.release_partner_payout_by_bill_no(text, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_partner_payout_request(text, text) from public, anon, authenticated;
grant execute on function public.release_partner_payout_request(uuid, text) to service_role;
grant execute on function public.release_partner_payout_by_bill_no(text, text, boolean) to service_role;
grant execute on function public.complete_partner_payout_request(text, text) to service_role;

create or replace function public.bind_channel_wechat_identity(
  p_token_hash text,
  p_appid text,
  p_openid text
) returns public.distribution_partners
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.partner_wechat_bind_tickets;
  v_partner public.distribution_partners;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or length(coalesce(p_appid, '')) < 8 or length(coalesce(p_openid, '')) < 20 then
    raise exception 'invalid_wechat_binding_input';
  end if;

  select * into v_ticket
  from public.partner_wechat_bind_tickets
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'wechat_bind_ticket_invalid';
  end if;

  select * into v_partner
  from public.distribution_partners
  where id = v_ticket.partner_id
    and status = 'active'
    and portal_enabled = true
  for update;

  if not found then
    raise exception 'channel_not_available';
  end if;
  if v_partner.wechat_openid is not null and v_partner.wechat_openid <> p_openid then
    raise exception 'channel_wechat_already_bound';
  end if;

  update public.distribution_partners
  set wechat_openid = p_openid,
      wechat_appid = p_appid,
      wechat_bound_at = coalesce(wechat_bound_at, now()),
      payout_method = 'wechat_balance',
      updated_at = now()
  where id = v_partner.id
  returning * into v_partner;

  update public.partner_wechat_bind_tickets
  set consumed_at = now()
  where id = v_ticket.id;

  return v_partner;
end;
$$;

revoke all on function public.bind_channel_wechat_identity(text, text, text) from public, anon, authenticated;
grant execute on function public.bind_channel_wechat_identity(text, text, text) to service_role;

alter table public.partner_portal_sessions enable row level security;
alter table public.partner_wechat_bind_tickets enable row level security;
alter table public.partner_payout_requests enable row level security;
alter table public.partner_payout_allocations enable row level security;

revoke all on table public.partner_portal_sessions from anon, authenticated;
revoke all on table public.partner_wechat_bind_tickets from anon, authenticated;
revoke all on table public.partner_payout_requests from anon, authenticated;
revoke all on table public.partner_payout_allocations from anon, authenticated;
grant all on table public.partner_portal_sessions to service_role;
grant all on table public.partner_wechat_bind_tickets to service_role;
grant all on table public.partner_payout_requests to service_role;
grant all on table public.partner_payout_allocations to service_role;
