create table if not exists public.wechatpay_webhook_events (
  transaction_id text primary key,
  notification_id text not null,
  event_type text not null,
  transaction jsonb not null,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  feishu_revenue_recorded_at timestamptz,
  feishu_notified_at timestamptz,
  last_error text
);

create index if not exists wechatpay_webhook_events_pending_idx
  on public.wechatpay_webhook_events(received_at asc)
  where processed_at is null;

alter table public.wechatpay_webhook_events enable row level security;

revoke all on table public.wechatpay_webhook_events from anon, authenticated;
grant all on table public.wechatpay_webhook_events to service_role;
