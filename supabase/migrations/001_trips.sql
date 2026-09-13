-- Pithop: saved trips for signed-in travellers.
--
-- Already applied to the Side-quest project (sufknfpyiynqstplrkqd). Kept here so
-- the schema is versioned with the code and can be recreated from scratch.
-- Safe to re-run: every statement is guarded.
--
-- Anonymous visitors are unaffected — they keep using localStorage, exactly as
-- before. This table only backs cross-device sync for people who sign in.

create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- Shown in the saved-trips list without having to parse the document.
  route_label   text not null default '',
  from_text     text not null default '',
  to_text       text not null default '',

  -- The trip itself: the same shape the app already stores locally (route
  -- geometry, stops, planned ids, vias, the day-by-day schedule). Kept as a
  -- document because it is always read and written whole, and its shape is
  -- owned by the client.
  data          jsonb not null default '{}'::jsonb,

  -- Trip preferences (personalities, pace, max detour) so a reopened trip
  -- ranks the same way it did when it was saved.
  prefs         jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Listing a traveller's own trips, newest first, is the only read pattern.
create index if not exists trips_user_updated_idx
  on public.trips (user_id, updated_at desc);

-- Keep updated_at honest rather than trusting the client to send it. The empty
-- search_path stops the function resolving unqualified names through whatever
-- path the caller happens to have set.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- This is the reason trips live in Supabase rather than a plain Postgres box:
-- the DATABASE enforces that you can only ever see your own trips. A bug in
-- application code cannot leak someone else's data, because the row never
-- leaves the server in the first place.
--
-- Every policy is scoped `to authenticated`, so a signed-out caller matches no
-- policy at all and sees nothing — rather than matching a policy that then
-- evaluates to false. auth.uid() is wrapped in a scalar sub-select so Postgres
-- evaluates it once per query instead of once per row.
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;

drop policy if exists "trips are readable by their owner" on public.trips;
create policy "trips are readable by their owner"
  on public.trips for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "trips are insertable by their owner" on public.trips;
create policy "trips are insertable by their owner"
  on public.trips for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- `using` decides which rows may be updated; `with check` stops an update from
-- reassigning a row to somebody else.
drop policy if exists "trips are updatable by their owner" on public.trips;
create policy "trips are updatable by their owner"
  on public.trips for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "trips are deletable by their owner" on public.trips;
create policy "trips are deletable by their owner"
  on public.trips for delete to authenticated
  using ((select auth.uid()) = user_id);
