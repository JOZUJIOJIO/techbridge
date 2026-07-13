create extension if not exists pgcrypto;

create table if not exists public.paid_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  plan text check (plan in ('annual', 'monthly') or plan is null),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text,
  current_period_end timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
    check (plan in ('annual', 'monthly') or plan is null);
  end if;
end $$;

create index if not exists paid_subscribers_status_idx on public.paid_subscribers(status);
create index if not exists paid_subscribers_current_period_end_idx on public.paid_subscribers(current_period_end);

alter table public.paid_subscribers enable row level security;

drop policy if exists "paid subscribers service role only" on public.paid_subscribers;
create policy "paid subscribers service role only"
on public.paid_subscribers
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
