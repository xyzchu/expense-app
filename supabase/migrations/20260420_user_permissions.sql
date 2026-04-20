-- User permissions table for feature access control.
-- Features: 'investing', 'webhook', 'shopper'
-- Add rows here to grant a user access to a feature.
-- No row = no access (deny by default).

create table if not exists public.user_permissions (
  user_id uuid references auth.users(id) on delete cascade not null,
  feature  text not null,
  granted_at timestamptz default now(),
  primary key (user_id, feature)
);

alter table public.user_permissions enable row level security;

-- Users can only read their own permissions
create policy "users read own permissions"
  on public.user_permissions for select
  using (auth.uid() = user_id);

-- Only service role (admin) can insert / update / delete
-- (no insert/update/delete policies = blocked for all authenticated users)

-- Seed: grant xyzchu@hotmail.com all restricted features
insert into public.user_permissions (user_id, feature)
select id, 'investing'  from auth.users where email = 'xyzchu@hotmail.com'
union all
select id, 'webhook'    from auth.users where email = 'xyzchu@hotmail.com'
union all
select id, 'shopper'    from auth.users where email = 'xyzchu@hotmail.com'
on conflict do nothing;
