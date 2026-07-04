-- cucu — auth phase schema.
-- One account row per Supabase auth user. Enough to answer "has this user created a
-- profile yet?" (`onboarded`). The rich profile schema arrives in the "create profile" phase.
--
-- Run in the Supabase SQL editor (or `supabase db push` if using the CLI).

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  onboarded   boolean     not null default false
);

alter table public.profiles enable row level security;

-- Users may only read/write their own row. The server uses the service-role key and
-- bypasses RLS; this policy protects any future direct-from-client access.
drop policy if exists "profiles_own_row" on public.profiles;
create policy "profiles_own_row"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
