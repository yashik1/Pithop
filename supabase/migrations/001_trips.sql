-- Pithop: saved trips for signed-in travellers.
--
-- Safe to re-run: every statement is guarded.
--
-- WHICH PROJECT THIS BELONGS TO
-- The live site connects to ystolaygiguimbhmuigj. Confirmed by reading the
-- deployed bundle itself: VITE_SUPABASE_URL is inlined at build time, so the
-- URL the client uses is a literal string in the shipped JavaScript. That is
-- the only check worth trusting — the dashboard will not show the value back
-- (it is marked Sensitive), and this repo is also linked to that project
-- through Supabase's GitHub integration, which is suggestive but is not the
-- same thing as what the client connects to.
--
-- There is a second, OLDER project, sufknfpyiynqstplrkqd, which this migration
-- was first applied to by mistake. It also has the trips table and its four
-- policies, and it is not used by anything. Running this against that project
-- does nothing useful, and — because the schema is identical — the
-- verification below passes there too. So confirm the ref before applying.
--
-- Anonymous visitors are unaffected — they keep using localStorage, exactly as
-- before. This table only backs cross-device sync for people who sign in.
--
-- VERIFY AFTER APPLYING. A migration run against a project that is still waking
-- from pause can report success and then be rolled back by the restore that
-- lands afterwards. Do not trust the "Success" message on its own — run the
-- verification query at the bottom of this file and read the result.

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

-- ---------------------------------------------------------------------------
-- Verification. Run this separately after applying, and read the output rather
-- than trusting the editor's "Success". Expect exactly: rls_enabled = true and
-- policy_count = 4. Anything else means the migration did not stick.
--
--   select
--     c.relname                                             as table_name,
--     c.relrowsecurity                                      as rls_enabled,
--     (select count(*) from pg_policies p
--       where p.schemaname = 'public' and p.tablename = 'trips') as policy_count
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'trips';
--
-- A table with rls_enabled = false is worse than no table at all: every row
-- would be readable by any client holding the anon key.
-- ---------------------------------------------------------------------------
