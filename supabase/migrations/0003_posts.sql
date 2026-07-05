-- cucu — posts phase. A text post: a body + up to 6 hashtags, authored by a profile.
-- Run in the Supabase SQL editor (after 0002_profile_identity.sql).

create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  author_id   uuid        not null references public.profiles (id) on delete cascade,
  body        text        not null,
  hashtags    text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Defense in depth: the server also validates, but the DB is the last word.
  constraint posts_body_length check (char_length(body) between 1 and 500),
  constraint posts_hashtag_count
    check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 6)
);

-- Newest-first feed reads, per-author reads, and hashtag/space containment queries.
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx  on public.posts (author_id);
create index if not exists posts_hashtags_idx    on public.posts using gin (hashtags);

alter table public.posts enable row level security;

-- The server uses the service-role key and bypasses RLS. These policies protect any
-- future direct-from-client access: anyone signed in may read; only the author may write.
drop policy if exists "posts_read_all" on public.posts;
create policy "posts_read_all"
  on public.posts
  for select
  using (true);

drop policy if exists "posts_author_write" on public.posts;
create policy "posts_author_write"
  on public.posts
  for all
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Reuse the shared set_updated_at() trigger function defined in 0001_profiles.sql.
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();
