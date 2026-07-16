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

revoke all on table public.member_wecom_onboarding from anon, authenticated;
grant all on table public.member_wecom_onboarding to service_role;;
