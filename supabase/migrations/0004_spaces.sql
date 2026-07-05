-- cucu — spaces phase. A Space is a user's private, saved lens over the post feed: a name,
-- an emoji, an accent, and the hashtags whose posts it curates. Owner-only.
-- Run in the Supabase SQL editor (after 0003_posts.sql).

create table if not exists public.spaces (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null,
  icon        text        not null default '',
  hashtags    text[]      not null default '{}',
  accent      text        not null default 'pink',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Defense in depth: the server also validates.
  constraint spaces_name_length check (char_length(name) between 1 and 50),
  constraint spaces_hashtag_count
    check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 12)
);

-- A user lists their own spaces, newest first.
create index if not exists spaces_owner_id_idx on public.spaces (owner_id, created_at desc);

alter table public.spaces enable row level security;

-- Spaces are private: only the owner can read or write their own. The server uses the
-- service-role key (bypasses RLS); this guards any future direct-from-client access.
drop policy if exists "spaces_owner_all" on public.spaces;
create policy "spaces_owner_all"
  on public.spaces
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Reuse the shared set_updated_at() trigger function defined in 0001_profiles.sql.
drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row
  execute function public.set_updated_at();
