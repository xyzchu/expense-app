alter table public.tasks
  add column if not exists source text,
  add column if not exists external_id text;

create unique index if not exists tasks_user_source_external_idx
  on public.tasks (user_id, source, external_id)
  where source is not null and external_id is not null;
