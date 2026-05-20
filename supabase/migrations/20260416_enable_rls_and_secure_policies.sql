create or replace function public.can_access_expense_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.list_members lm
    where lm.list_id = p_list_id
      and lm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.expense_lists el
    where el.id = p_list_id
      and el.created_by = auth.uid()
  );
$$;

revoke all on function public.can_access_expense_list(uuid) from public;
grant execute on function public.can_access_expense_list(uuid) to authenticated;

create or replace function public.join_expense_list_by_invite_code(
  p_invite_code text,
  p_display_name text,
  p_email text default null
)
returns public.expense_lists
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_list public.expense_lists;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_list
  from public.expense_lists
  where lower(invite_code) = lower(trim(p_invite_code))
  limit 1;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into public.list_members (list_id, user_id, display_name, email)
  values (v_list.id, v_user_id, trim(p_display_name), p_email)
  on conflict (list_id, user_id)
  do update
    set display_name = excluded.display_name,
        email = excluded.email;

  return v_list;
end;
$$;

revoke all on function public.join_expense_list_by_invite_code(text, text, text) from public;
grant execute on function public.join_expense_list_by_invite_code(text, text, text) to authenticated;

alter table public.expense_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.expenses enable row level security;
alter table public.list_settings enable row level security;
alter table public.webhook_tokens enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_snapshots enable row level security;
alter table public.financial_date_rates enable row level security;
alter table public.securities_transactions enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "expense lists select for members" on public.expense_lists;
create policy "expense lists select for members"
on public.expense_lists
for select
to authenticated
using (public.can_access_expense_list(id));

drop policy if exists "expense lists insert for creator" on public.expense_lists;
create policy "expense lists insert for creator"
on public.expense_lists
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "expense lists update for creator" on public.expense_lists;
create policy "expense lists update for creator"
on public.expense_lists
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "expense lists delete for creator" on public.expense_lists;
create policy "expense lists delete for creator"
on public.expense_lists
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "list members select for list access" on public.list_members;
create policy "list members select for list access"
on public.list_members
for select
to authenticated
using (public.can_access_expense_list(list_id));

drop policy if exists "list members insert own creator membership" on public.list_members;
create policy "list members insert own creator membership"
on public.list_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.expense_lists el
    where el.id = list_id
      and el.created_by = auth.uid()
  )
);

drop policy if exists "list members update own row" on public.list_members;
create policy "list members update own row"
on public.list_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "list members delete own row or creator" on public.list_members;
create policy "list members delete own row or creator"
on public.list_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.expense_lists el
    where el.id = list_id
      and el.created_by = auth.uid()
  )
);

drop policy if exists "expenses select for members" on public.expenses;
create policy "expenses select for members"
on public.expenses
for select
to authenticated
using (public.can_access_expense_list(list_id));

drop policy if exists "expenses insert for members" on public.expenses;
create policy "expenses insert for members"
on public.expenses
for insert
to authenticated
with check (public.can_access_expense_list(list_id));

drop policy if exists "expenses update for members" on public.expenses;
create policy "expenses update for members"
on public.expenses
for update
to authenticated
using (public.can_access_expense_list(list_id))
with check (public.can_access_expense_list(list_id));

drop policy if exists "expenses delete for members" on public.expenses;
create policy "expenses delete for members"
on public.expenses
for delete
to authenticated
using (public.can_access_expense_list(list_id));

drop policy if exists "list settings select for members" on public.list_settings;
create policy "list settings select for members"
on public.list_settings
for select
to authenticated
using (public.can_access_expense_list(list_id));

drop policy if exists "list settings insert for members" on public.list_settings;
create policy "list settings insert for members"
on public.list_settings
for insert
to authenticated
with check (public.can_access_expense_list(list_id));

drop policy if exists "list settings update for members" on public.list_settings;
create policy "list settings update for members"
on public.list_settings
for update
to authenticated
using (public.can_access_expense_list(list_id))
with check (public.can_access_expense_list(list_id));

drop policy if exists "list settings delete for creator" on public.list_settings;
create policy "list settings delete for creator"
on public.list_settings
for delete
to authenticated
using (
  exists (
    select 1
    from public.expense_lists el
    where el.id = list_id
      and el.created_by = auth.uid()
  )
);

drop policy if exists "webhook tokens select own" on public.webhook_tokens;
create policy "webhook tokens select own"
on public.webhook_tokens
for select
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "webhook tokens insert own" on public.webhook_tokens;
create policy "webhook tokens insert own"
on public.webhook_tokens
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "webhook tokens update own" on public.webhook_tokens;
create policy "webhook tokens update own"
on public.webhook_tokens
for update
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
)
with check (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "webhook tokens delete own" on public.webhook_tokens;
create policy "webhook tokens delete own"
on public.webhook_tokens
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "push subscriptions select own" on public.push_subscriptions;
create policy "push subscriptions select own"
on public.push_subscriptions
for select
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own"
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own"
on public.push_subscriptions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
)
with check (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own"
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_expense_list(list_id)
);

drop policy if exists "financial accounts own rows" on public.financial_accounts;
create policy "financial accounts own rows"
on public.financial_accounts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "financial snapshots own rows" on public.financial_snapshots;
create policy "financial snapshots own rows"
on public.financial_snapshots
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "financial date rates own rows" on public.financial_date_rates;
create policy "financial date rates own rows"
on public.financial_date_rates
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "securities transactions own rows" on public.securities_transactions;
create policy "securities transactions own rows"
on public.securities_transactions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user settings own rows" on public.user_settings;
create policy "user settings own rows"
on public.user_settings
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
