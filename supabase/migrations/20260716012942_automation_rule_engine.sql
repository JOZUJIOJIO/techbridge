alter table public.member_wecom_onboarding
  add column if not exists automation_rule_key text not null default 'website_stripe_annual_199';

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  enabled boolean not null default false,
  priority integer not null default 0,
  trigger_event text not null,
  source_channel text not null,
  customer_type text not null,
  wecom_user_id text,
  tag_names text[] not null default '{}',
  welcome_message text,
  group_key text,
  group_name text,
  send_group_invite boolean not null default false,
  notify_feishu boolean not null default false,
  write_attribution boolean not null default true,
  version integer not null default 1,
  valid_from timestamptz,
  valid_until timestamptz,
  source_system text not null default 'feishu',
  source_record_id text unique,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_match_idx
  on public.automation_rules(enabled, trigger_event, priority desc);

create table if not exists public.automation_resource_mappings (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('wecom_tag', 'wecom_group')),
  resource_key text not null,
  display_name text not null,
  external_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(resource_type, resource_key)
);

create table if not exists public.customer_attributions (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null unique,
  customer_name text,
  email text,
  wecom_external_user_id text,
  wecom_user_id text,
  rule_key text references public.automation_rules(rule_key),
  source_channel text,
  customer_type text,
  stage text not null default 'new_lead' check (
    stage in ('new_lead', 'paid', 'wecom_added', 'group_invite_sent', 'group_joined', 'lost')
  ),
  tag_names text[] not null default '{}',
  order_id text unique,
  amount_total bigint,
  currency text,
  first_touch_at timestamptz,
  paid_at timestamptz,
  wecom_added_at timestamptz,
  group_invite_sent_at timestamptz,
  group_joined_at timestamptz,
  last_event text,
  last_error text,
  feishu_record_id text,
  feishu_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_attributions_rule_idx
  on public.customer_attributions(rule_key, stage);
create index if not exists customer_attributions_wecom_idx
  on public.customer_attributions(wecom_external_user_id)
  where wecom_external_user_id is not null;

create table if not exists public.automation_execution_logs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null,
  idempotency_key text not null unique,
  rule_key text,
  customer_key text,
  source_channel text,
  event_type text not null,
  action text not null,
  status text not null check (
    status in ('pending', 'running', 'success', 'partial', 'failed', 'skipped')
  ),
  attempt integer not null default 1,
  duration_ms integer,
  error_code text,
  error_detail text,
  original_event_id text,
  executed_at timestamptz not null default now(),
  next_retry_at timestamptz,
  feishu_record_id text,
  feishu_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_execution_logs_sync_idx
  on public.automation_execution_logs(feishu_synced_at, executed_at);
create index if not exists automation_execution_logs_customer_idx
  on public.automation_execution_logs(customer_key, executed_at desc);

insert into public.automation_rules (
  rule_key,
  name,
  enabled,
  priority,
  trigger_event,
  source_channel,
  customer_type,
  wecom_user_id,
  tag_names,
  welcome_message,
  group_key,
  group_name,
  send_group_invite,
  notify_feishu,
  write_attribution,
  version,
  source_system,
  source_record_id,
  synced_at,
  updated_at
) values (
  'website_stripe_annual_199',
  '官网¥199年度会员',
  true,
  100,
  'wecom_contact_added',
  'Tech Bridge官网',
  '付费会员',
  'shirleyLin',
  array['官网来源', '199元付费会员'],
  '欢迎加入 Tech Bridge 会员。你的付款与会员资格已经自动核验。请点击下方入口，长按识别二维码加入会员群。',
  'member-core',
  '比特自媒体核心群',
  true,
  true,
  true,
  1,
  'seed',
  'recvpuK8g1GPCB',
  now(),
  now()
) on conflict (rule_key) do update set
  name = excluded.name,
  enabled = excluded.enabled,
  priority = excluded.priority,
  trigger_event = excluded.trigger_event,
  source_channel = excluded.source_channel,
  customer_type = excluded.customer_type,
  wecom_user_id = excluded.wecom_user_id,
  tag_names = excluded.tag_names,
  welcome_message = excluded.welcome_message,
  group_key = excluded.group_key,
  group_name = excluded.group_name,
  send_group_invite = excluded.send_group_invite,
  notify_feishu = excluded.notify_feishu,
  write_attribution = excluded.write_attribution,
  version = excluded.version,
  source_record_id = excluded.source_record_id,
  synced_at = excluded.synced_at,
  updated_at = excluded.updated_at;

alter table public.automation_rules enable row level security;
alter table public.automation_resource_mappings enable row level security;
alter table public.customer_attributions enable row level security;
alter table public.automation_execution_logs enable row level security;

revoke all on table public.automation_rules from anon, authenticated;
revoke all on table public.automation_resource_mappings from anon, authenticated;
revoke all on table public.customer_attributions from anon, authenticated;
revoke all on table public.automation_execution_logs from anon, authenticated;

grant all on table public.automation_rules to service_role;
grant all on table public.automation_resource_mappings to service_role;
grant all on table public.customer_attributions to service_role;
grant all on table public.automation_execution_logs to service_role;
