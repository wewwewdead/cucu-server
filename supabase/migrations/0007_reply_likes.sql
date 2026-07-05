-- cucu — reply likes. Same shape as post_likes: one row per (reply, user), with a denormalized
-- replies.like_count kept accurate by a trigger. Run in the Supabase SQL editor (after 0006_replies.sql).

create table if not exists public.reply_likes (
  reply_id    uuid        not null references public.replies (id)  on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (reply_id, user_id)   -- a user can like a reply at most once
);

create index if not exists reply_likes_user_idx on public.reply_likes (user_id);

alter table public.replies add column if not exists like_count integer not null default 0;

create or replace function public.bump_reply_like_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.replies set like_count = like_count + 1 where id = new.reply_id;
  elsif (tg_op = 'DELETE') then
    update public.replies set like_count = greatest(like_count - 1, 0) where id = old.reply_id;
  end if;
  return null;
end;
$$;

-- ON CONFLICT DO NOTHING inserts don't fire this, so a duplicate like can't drift the count.
drop trigger if exists reply_likes_count on public.reply_likes;
create trigger reply_likes_count
  after insert or delete on public.reply_likes
  for each row
  execute function public.bump_reply_like_count();

alter table public.reply_likes enable row level security;

-- The server uses the service-role key (bypasses RLS). Guards for future direct client access:
-- like counts are public to read; you may only add/remove your own like.
drop policy if exists "reply_likes_read_all" on public.reply_likes;
create policy "reply_likes_read_all"
  on public.reply_likes
  for select
  using (true);

drop policy if exists "reply_likes_own_write" on public.reply_likes;
create policy "reply_likes_own_write"
  on public.reply_likes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
