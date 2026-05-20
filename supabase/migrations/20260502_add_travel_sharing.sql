create table if not exists public.travel_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'My Travel',
  invite_code text unique not null default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.travel_trip_members (
  trip_id uuid references public.travel_trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text,
  role text not null default 'member',
  joined_at timestamptz default now(),
  primary key (trip_id, user_id)
);

alter table public.travel_bookings
  add column if not exists trip_id uuid references public.travel_trips(id) on delete cascade;

insert into public.travel_trips (owner_id, name)
select distinct tb.user_id, 'My Travel'
from public.travel_bookings tb
where tb.trip_id is null
  and tb.user_id is not null
  and not exists (
    select 1
    from public.travel_trips tt
    where tt.owner_id = tb.user_id
  );

insert into public.travel_trip_members (trip_id, user_id, display_name, role)
select tt.id, tt.owner_id, coalesce(au.email, 'Me'), 'owner'
from public.travel_trips tt
left join auth.users au on au.id = tt.owner_id
where not exists (
  select 1
  from public.travel_trip_members ttm
  where ttm.trip_id = tt.id
    and ttm.user_id = tt.owner_id
);

update public.travel_bookings tb
set trip_id = tt.id
from public.travel_trips tt
where tb.trip_id is null
  and tt.owner_id = tb.user_id;

create or replace function public.can_access_travel_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_trip_id is not null
    and (
      exists (
        select 1
        from public.travel_trip_members ttm
        where ttm.trip_id = p_trip_id
          and ttm.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.travel_trips tt
        where tt.id = p_trip_id
          and tt.owner_id = auth.uid()
      )
    );
$$;

revoke all on function public.can_access_travel_trip(uuid) from public;
grant execute on function public.can_access_travel_trip(uuid) to authenticated;

create or replace function public.join_travel_trip_by_invite_code(
  p_invite_code text,
  p_display_name text default null
)
returns public.travel_trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip public.travel_trips;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_trip
  from public.travel_trips
  where lower(invite_code) = lower(trim(p_invite_code))
  limit 1;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into public.travel_trip_members (trip_id, user_id, display_name, role)
  values (v_trip.id, v_user_id, nullif(trim(coalesce(p_display_name, '')), ''), 'member')
  on conflict (trip_id, user_id)
  do update
    set display_name = coalesce(excluded.display_name, public.travel_trip_members.display_name);

  return v_trip;
end;
$$;

revoke all on function public.join_travel_trip_by_invite_code(text, text) from public;
grant execute on function public.join_travel_trip_by_invite_code(text, text) to authenticated;

alter table public.travel_trips enable row level security;
alter table public.travel_trip_members enable row level security;
alter table public.travel_bookings enable row level security;

drop policy if exists "travel trips select for members" on public.travel_trips;
create policy "travel trips select for members"
on public.travel_trips
for select
to authenticated
using (public.can_access_travel_trip(id));

drop policy if exists "travel trips insert for owner" on public.travel_trips;
create policy "travel trips insert for owner"
on public.travel_trips
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "travel trips update for owner" on public.travel_trips;
create policy "travel trips update for owner"
on public.travel_trips
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "travel trips delete for owner" on public.travel_trips;
create policy "travel trips delete for owner"
on public.travel_trips
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "travel trip members select for trip access" on public.travel_trip_members;
create policy "travel trip members select for trip access"
on public.travel_trip_members
for select
to authenticated
using (public.can_access_travel_trip(trip_id));

drop policy if exists "travel trip members insert for owner" on public.travel_trip_members;
create policy "travel trip members insert for owner"
on public.travel_trip_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.travel_trips tt
    where tt.id = trip_id
      and tt.owner_id = auth.uid()
  )
);

drop policy if exists "travel trip members update own row" on public.travel_trip_members;
create policy "travel trip members update own row"
on public.travel_trip_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "travel trip members delete own row or owner" on public.travel_trip_members;
create policy "travel trip members delete own row or owner"
on public.travel_trip_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.travel_trips tt
    where tt.id = trip_id
      and tt.owner_id = auth.uid()
  )
);

drop policy if exists "travel bookings select for trip members" on public.travel_bookings;
create policy "travel bookings select for trip members"
on public.travel_bookings
for select
to authenticated
using (user_id = auth.uid() or public.can_access_travel_trip(trip_id));

drop policy if exists "travel bookings insert for trip members" on public.travel_bookings;
create policy "travel bookings insert for trip members"
on public.travel_bookings
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (trip_id is null or public.can_access_travel_trip(trip_id))
);

drop policy if exists "travel bookings update for trip members" on public.travel_bookings;
create policy "travel bookings update for trip members"
on public.travel_bookings
for update
to authenticated
using (user_id = auth.uid() or public.can_access_travel_trip(trip_id))
with check (user_id = auth.uid() or public.can_access_travel_trip(trip_id));

drop policy if exists "travel bookings delete for trip members" on public.travel_bookings;
create policy "travel bookings delete for trip members"
on public.travel_bookings
for delete
to authenticated
using (user_id = auth.uid() or public.can_access_travel_trip(trip_id));
