-- cucu — create-profile phase. Adds the social identity to the account row.
-- Run in the Supabase SQL editor (after 0001_profiles.sql).

alter table public.profiles
  add column if not exists username     text,
  add column if not exists display_name text,
  add column if not exists bio          text,
  add column if not exists avatar_url   text;

-- Case-insensitive uniqueness: "@Mira" and "@mira" cannot both exist.
-- Partial (username is not null) so account rows created before onboarding don't collide on NULL.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;
