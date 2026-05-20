create table if not exists public.futu_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('transactions', 'prices', 'summary', 'full_sync')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_heartbeat_at timestamptz
);

create index if not exists futu_refresh_requests_user_status_idx
  on public.futu_refresh_requests (user_id, status, requested_at desc);

create index if not exists futu_refresh_requests_status_idx
  on public.futu_refresh_requests (status, requested_at asc);

alter table public.futu_refresh_requests enable row level security;

drop policy if exists "futu refresh requests own rows" on public.futu_refresh_requests;
create policy "futu refresh requests own rows"
on public.futu_refresh_requests
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'futu_refresh_requests'
  ) then
    alter publication supabase_realtime add table public.futu_refresh_requests;
  end if;
end
$$;
