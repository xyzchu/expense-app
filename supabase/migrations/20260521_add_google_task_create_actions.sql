alter table public.google_task_actions
  add column if not exists payload jsonb;

alter table public.google_task_actions
  alter column google_task_id drop not null;

alter table public.google_task_actions
  drop constraint if exists google_task_actions_action_check;

alter table public.google_task_actions
  add constraint google_task_actions_action_check
  check (action in ('create', 'complete', 'uncomplete'));
