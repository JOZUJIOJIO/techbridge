alter table public.distribution_partners
  add column if not exists channel_number integer unique
    check (channel_number between 1000 and 9999),
  add column if not exists recipient_label text,
  add column if not exists joined_at timestamptz;

create table if not exists public.distribution_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null,
  summary text,
  landing_path text not null check (landing_path like '/%'),
  price_amount integer not null check (price_amount > 0),
  currency text not null default 'cny',
  default_commission_amount integer not null check (default_commission_amount > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  poster_eyebrow text,
  poster_title text,
  poster_subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.distribution_products (
  slug, name, summary, landing_path, price_amount, currency,
  default_commission_amount, status, poster_eyebrow, poster_title, poster_subtitle
) values (
  'ai-skills-annual',
  'AI Skills 年度买手服务',
  '全年至少12期，每期精选5到10个高价值AI Skills。',
  '/skills',
  66600,
  'cny',
  19980,
  'active',
  'AI SKILLS BUYER SERVICE',
  'AI Skills 年度买手服务',
  '持续一年的高价值能力筛选'
) on conflict (slug) do update set
  name = excluded.name,
  summary = excluded.summary,
  landing_path = excluded.landing_path,
  price_amount = excluded.price_amount,
  default_commission_amount = excluded.default_commission_amount,
  status = excluded.status,
  poster_eyebrow = excluded.poster_eyebrow,
  poster_title = excluded.poster_title,
  poster_subtitle = excluded.poster_subtitle,
  updated_at = now();

create table if not exists public.distribution_invites (
  id uuid primary key default gen_random_uuid(),
  invite_slug text not null unique check (invite_slug ~ '^[A-Za-z0-9_-]{24,64}$'),
  recipient_label text not null,
  partner_id uuid not null references public.distribution_partners(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'opened', 'claimed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  opened_at timestamptz,
  claimed_at timestamptz,
  pc_last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_product_commissions (
  partner_id uuid not null references public.distribution_partners(id) on delete cascade,
  product_id uuid not null references public.distribution_products(id) on delete cascade,
  commission_amount integer not null check (commission_amount > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (partner_id, product_id)
);

alter table public.partner_order_commissions
  add column if not exists product_id uuid references public.distribution_products(id);

alter table public.paid_subscribers
  add column if not exists distribution_product_id uuid references public.distribution_products(id);

create index if not exists distribution_invites_status_idx
  on public.distribution_invites(status, created_at desc);
create index if not exists distribution_invites_partner_idx
  on public.distribution_invites(partner_id, created_at desc);

create or replace function public.mark_distribution_invites_claimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.wechat_bound_at is not null and old.wechat_bound_at is null then
    update public.distribution_invites
    set status = 'claimed', claimed_at = now(), updated_at = now()
    where partner_id = new.id and status in ('pending', 'opened');
    new.joined_at = coalesce(new.joined_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_partner_wechat_claimed on public.distribution_partners;
create trigger distribution_partner_wechat_claimed
before update of wechat_bound_at on public.distribution_partners
for each row execute function public.mark_distribution_invites_claimed();

alter table public.distribution_products enable row level security;
alter table public.distribution_invites enable row level security;
alter table public.distribution_product_commissions enable row level security;
revoke all on table public.distribution_products from anon, authenticated;
revoke all on table public.distribution_invites from anon, authenticated;
revoke all on table public.distribution_product_commissions from anon, authenticated;
grant all on table public.distribution_products to service_role;
grant all on table public.distribution_invites to service_role;
grant all on table public.distribution_product_commissions to service_role;
