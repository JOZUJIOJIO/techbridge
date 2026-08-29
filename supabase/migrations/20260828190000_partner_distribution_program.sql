create table if not exists public.distribution_partners (
  id uuid primary key default gen_random_uuid(),
  partner_code text not null unique check (partner_code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name text not null,
  partner_tier text not null default 'standard' check (partner_tier in ('standard', 'strategic')),
  commission_amount integer not null default 20000 check (commission_amount in (20000, 40000)),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  attribution_days integer not null default 30 check (attribution_days between 1 and 90),
  payout_delay_days integer not null default 8 check (payout_delay_days between 1 and 30),
  payout_method text not null default 'manual' check (payout_method in ('manual', 'stripe_connect')),
  connect_account_id text,
  payouts_enabled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distribution_partner_tier_amount_check check (
    (partner_tier = 'standard' and commission_amount = 20000)
    or (partner_tier = 'strategic' and commission_amount = 40000)
  )
);

create table if not exists public.partner_order_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.distribution_partners(id),
  partner_code text not null,
  partner_tier text not null check (partner_tier in ('standard', 'strategic')),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  gross_amount integer not null check (gross_amount > 0),
  commission_amount integer not null check (commission_amount in (19980, 20000, 40000)),
  platform_gross_amount integer not null check (platform_gross_amount >= 0),
  currency text not null default 'cny',
  status text not null default 'pending' check (
    status in ('pending', 'eligible', 'transferring', 'transferred', 'cancelled', 'reversal_required')
  ),
  eligible_at timestamptz not null,
  transfer_id text,
  transferred_at timestamptz,
  refund_amount integer not null default 0,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_order_commissions_partner_idx
  on public.partner_order_commissions(partner_id, created_at desc);
create index if not exists partner_order_commissions_payout_idx
  on public.partner_order_commissions(status, eligible_at)
  where status in ('pending', 'eligible');
create index if not exists partner_order_commissions_payment_intent_idx
  on public.partner_order_commissions(stripe_payment_intent_id);

alter table public.paid_subscribers
  add column if not exists partner_id uuid references public.distribution_partners(id),
  add column if not exists partner_code text,
  add column if not exists partner_tier text,
  add column if not exists partner_commission_amount integer,
  add column if not exists partner_payout_delay_days integer;

alter table public.distribution_partners enable row level security;
alter table public.partner_order_commissions enable row level security;

revoke all on table public.distribution_partners from anon, authenticated;
revoke all on table public.partner_order_commissions from anon, authenticated;
grant all on table public.distribution_partners to service_role;
grant all on table public.partner_order_commissions to service_role;
