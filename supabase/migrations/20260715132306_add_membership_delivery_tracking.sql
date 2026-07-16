alter table public.paid_subscribers
  add column if not exists customer_name text;

alter table public.stripe_webhook_events
  add column if not exists feishu_notified_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists last_error text;;
