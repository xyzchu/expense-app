create table if not exists public.google_agenda_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('calendar', 'task_list')),
  external_id text not null,
  name text not null,
  color text,
  selected boolean not null default true,
  raw jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, external_id)
);

create table if not exists public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.google_agenda_sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  status text,
  html_link text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_id, external_id)
);

create index if not exists google_calendar_events_user_start_idx
  on public.google_calendar_events (user_id, start_at);

create table if not exists public.google_tasks_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.google_agenda_sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  notes text,
  due_date date,
  status text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_id, external_id)
);

create index if not exists google_tasks_cache_user_due_idx
  on public.google_tasks_cache (user_id, is_completed, due_date);

create table if not exists public.google_task_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_cache_id uuid references public.google_tasks_cache(id) on delete set null,
  source_id uuid references public.google_agenda_sources(id) on delete set null,
  google_task_id text not null,
  google_task_list_id text not null,
  action text not null check (action in ('complete', 'uncomplete')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists google_task_actions_user_status_idx
  on public.google_task_actions (user_id, status, created_at);

alter table public.google_agenda_sources enable row level security;
alter table public.google_calendar_events enable row level security;
alter table public.google_tasks_cache enable row level security;
alter table public.google_task_actions enable row level security;

drop policy if exists "users manage own google agenda sources" on public.google_agenda_sources;
create policy "users manage own google agenda sources"
  on public.google_agenda_sources for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own google calendar events" on public.google_calendar_events;
create policy "users manage own google calendar events"
  on public.google_calendar_events for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own google tasks cache" on public.google_tasks_cache;
create policy "users manage own google tasks cache"
  on public.google_tasks_cache for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own google task actions" on public.google_task_actions;
create policy "users manage own google task actions"
  on public.google_task_actions for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
