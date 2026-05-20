create table if not exists public.securities_monthly_quotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  ticker text not null,
  market text not null default 'US',
  quote_date date not null,
  price numeric not null,
  source text,
  data_time text,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, month_key, ticker)
);

create index if not exists securities_monthly_quotes_user_month_idx
  on public.securities_monthly_quotes (user_id, month_key desc, ticker);

alter table public.securities_monthly_quotes enable row level security;

drop policy if exists "securities monthly quotes own rows" on public.securities_monthly_quotes;
create policy "securities monthly quotes own rows"
on public.securities_monthly_quotes
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.securities_performance_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  month_key text not null,
  snapshot_kind text not null check (snapshot_kind in ('month_end', 'current')),
  bank text not null,
  market_value numeric not null default 0,
  cost_basis numeric not null default 0,
  unrealized_pnl numeric not null default 0,
  realized_pnl numeric not null default 0,
  dividends numeric not null default 0,
  total_pnl numeric not null default 0,
  open_positions integer not null default 0,
  refreshed_at timestamptz not null default now(),
  source text,
  primary key (user_id, snapshot_date, bank)
);

create index if not exists securities_performance_snapshots_user_month_idx
  on public.securities_performance_snapshots (user_id, snapshot_date desc, bank);

alter table public.securities_performance_snapshots enable row level security;

drop policy if exists "securities performance snapshots own rows" on public.securities_performance_snapshots;
create policy "securities performance snapshots own rows"
on public.securities_performance_snapshots
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.futu_refresh_requests
  drop constraint if exists futu_refresh_requests_request_type_check;

alter table public.futu_refresh_requests
  add constraint futu_refresh_requests_request_type_check
  check (request_type in ('transactions', 'prices', 'summary', 'statistics', 'full_sync'));
