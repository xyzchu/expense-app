create table if not exists public.securities_daily_quotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_date date not null,
  ticker text not null,
  market text not null default 'US',
  price numeric not null,
  source text,
  data_time text,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, quote_date, ticker)
);

create index if not exists securities_daily_quotes_user_date_idx
  on public.securities_daily_quotes (user_id, quote_date desc, ticker);

alter table public.securities_daily_quotes enable row level security;

drop policy if exists "securities daily quotes own rows" on public.securities_daily_quotes;
create policy "securities daily quotes own rows"
on public.securities_daily_quotes
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
