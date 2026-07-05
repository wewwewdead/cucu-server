-- cucu — post likes. One row per (post, user); a denormalized counter on posts keeps feed reads
-- O(1). Run in the Supabase SQL editor (after 0003_posts.sql).

create table if not exists public.post_likes (
  post_id     uuid        not null references public.posts (id)    on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)   -- a user can like a post at most once
);

-- "Who liked what" lookups (e.g. the caller's likes across a feed page).
create index if not exists post_likes_user_idx on public.post_likes (user_id);

-- Denormalized like counter, maintained by the trigger below so reads never aggregate.
alter table public.posts add column if not exists like_count integer not null default 0;

create or replace function public.bump_post_like_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

-- ON CONFLICT DO NOTHING inserts don't fire this, so the count can't drift on a duplicate like.
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row
  execute function public.bump_post_like_count();

alter table public.post_likes enable row level security;

-- The server uses the service-role key (bypasses RLS). Guards for any future direct client access:
-- like counts are public (anyone signed in can read), but you may only add/remove your own like.
drop policy if exists "post_likes_read_all" on public.post_likes;
create policy "post_likes_read_all"
  on public.post_likes
  for select
  using (true);

drop policy if exists "post_likes_own_write" on public.post_likes;
create policy "post_likes_own_write"
  on public.post_likes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
