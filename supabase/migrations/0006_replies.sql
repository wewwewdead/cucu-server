-- cucu — threaded replies. Adjacency-list model: each reply points at its parent (null = a
-- top-level reply to the post). A whole post's thread is fetched flat and assembled into a tree
-- client-side. A denormalized posts.reply_count keeps feed cards O(1).
-- Run in the Supabase SQL editor (after 0003_posts.sql).

create table if not exists public.replies (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.posts (id)    on delete cascade,
  -- Self-reference: null = replies to the post; otherwise replies to another reply. Deleting a
  -- reply cascades to its whole subtree.
  parent_id   uuid                 references public.replies (id)  on delete cascade,
  author_id   uuid        not null references public.profiles (id) on delete cascade,
  body        text        not null,
  created_at  timestamptz not null default now(),
  constraint replies_body_length check (char_length(body) between 1 and 500)
);

create index if not exists replies_post_id_idx   on public.replies (post_id, created_at);
create index if not exists replies_parent_id_idx on public.replies (parent_id);

-- Denormalized reply counter on posts, maintained by the trigger below (cascade deletes fire it
-- per row, so deleting a subtree decrements the count correctly).
alter table public.posts add column if not exists reply_count integer not null default 0;

create or replace function public.bump_post_reply_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists replies_count on public.replies;
create trigger replies_count
  after insert or delete on public.replies
  for each row
  execute function public.bump_post_reply_count();

alter table public.replies enable row level security;

-- The server uses the service-role key (bypasses RLS). Guards for future direct client access:
-- replies are public to read; you may only write/delete your own.
drop policy if exists "replies_read_all" on public.replies;
create policy "replies_read_all"
  on public.replies
  for select
  using (true);

drop policy if exists "replies_author_write" on public.replies;
create policy "replies_author_write"
  on public.replies
  for all
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
