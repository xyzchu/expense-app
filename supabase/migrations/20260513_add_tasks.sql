create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  group_name text not null default 'Today',
  due_date date,
  is_done boolean not null default false,
  recurrence jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_done_due_idx
  on public.tasks (user_id, is_done, due_date, created_at desc);

create index if not exists tasks_user_group_idx
  on public.tasks (user_id, group_name);

alter table public.tasks enable row level security;

drop policy if exists "users manage own tasks" on public.tasks;
create policy "users manage own tasks"
  on public.tasks for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
