alter table public.stripe_webhook_events add column if not exists feishu_revenue_recorded_at timestamptz;;
