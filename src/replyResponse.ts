// Shared shape for a reply payload. Mirrors the client's `ReplyDTO`. `parentId` is null for a
// top-level reply to the post.

export interface ReplyAuthorRow {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export interface ReplyRow {
  id: string
  post_id: string
  parent_id: string | null
  body: string
  created_at: string
  like_count: number | null
  author: ReplyAuthorRow | ReplyAuthorRow[] | null
}

/** `likedByMe` is resolved per-caller by the route (from `reply_likes`) and passed in. */
export function toReplyResponse(row: ReplyRow, likedByMe: boolean) {
  const author = Array.isArray(row.author) ? (row.author[0] ?? null) : row.author
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    likeCount: row.like_count ?? 0,
    likedByMe,
    author: {
      username: author?.username ?? null,
      displayName: author?.display_name ?? null,
      avatarUrl: author?.avatar_url ?? null,
    },
  }
}
