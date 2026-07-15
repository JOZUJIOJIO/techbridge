create extension if not exists pgcrypto;

create table if not exists public.paid_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  customer_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  plan text check (plan = 'annual' or plan is null),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  current_period_end timestamptz,
  amount_total integer,
  currency text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paid_subscribers
  add column if not exists customer_name text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists amount_total integer,
  add column if not exists currency text;

create unique index if not exists paid_subscribers_payment_intent_idx
  on public.paid_subscribers(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists paid_subscribers_checkout_session_idx
  on public.paid_subscribers(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'paid_subscribers_status_check'
    and conrelid = 'public.paid_subscribers'::regclass
  ) then
    alter table public.paid_subscribers
    add constraint paid_subscribers_status_check
    check (status in ('pending', 'active', 'past_due', 'canceled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'paid_subscribers_plan_check'
    and conrelid = 'public.paid_subscribers'::regclass
  ) then
    alter table public.paid_subscribers
    add constraint paid_subscribers_plan_check
    check (plan = 'annual' or plan is null);
  end if;
end $$;

create index if not exists paid_subscribers_status_idx on public.paid_subscribers(status);
create index if not exists paid_subscribers_current_period_end_idx on public.paid_subscribers(current_period_end);

alter table public.paid_subscribers enable row level security;

drop policy if exists "paid subscribers service role only" on public.paid_subscribers;
revoke all on table public.paid_subscribers from anon, authenticated;
grant all on table public.paid_subscribers to service_role;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  feishu_notified_at timestamptz,
  feishu_revenue_recorded_at timestamptz,
  welcome_email_sent_at timestamptz,
  last_error text
);

alter table public.stripe_webhook_events
  add column if not exists feishu_notified_at timestamptz,
  add column if not exists feishu_revenue_recorded_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists last_error text;

alter table public.stripe_webhook_events enable row level security;

drop policy if exists "stripe webhook events service role only" on public.stripe_webhook_events;
revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

create table if not exists public.member_wecom_onboarding (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  email text not null,
  state_token text not null unique,
  status text not null default 'waiting_for_wecom' check (
    status in ('waiting_for_wecom', 'wecom_added', 'group_invite_sent', 'group_joined', 'active', 'error')
  ),
  contact_way_config_id text,
  contact_qr_url text,
  wecom_external_user_id text,
  wecom_user_id text,
  wecom_added_at timestamptz,
  welcome_sent_at timestamptz,
  tag_applied_at timestamptz,
  group_invite_sent_at timestamptz,
  group_joined_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_wecom_onboarding_state_idx
  on public.member_wecom_onboarding(state_token);
create index if not exists member_wecom_onboarding_external_user_idx
  on public.member_wecom_onboarding(wecom_external_user_id)
  where wecom_external_user_id is not null;
create index if not exists member_wecom_onboarding_status_idx
  on public.member_wecom_onboarding(status);

alter table public.member_wecom_onboarding enable row level security;

drop policy if exists "member wecom onboarding service role only" on public.member_wecom_onboarding;
revoke all on table public.member_wecom_onboarding from anon, authenticated;
grant all on table public.member_wecom_onboarding to service_role;
