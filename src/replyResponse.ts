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
  author: ReplyAuthorRow | ReplyAuthorRow[] | null
}

export function toReplyResponse(row: ReplyRow) {
  const author = Array.isArray(row.author) ? (row.author[0] ?? null) : row.author
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    author: {
      username: author?.username ?? null,
      displayName: author?.display_name ?? null,
      avatarUrl: author?.avatar_url ?? null,
    },
  }
}
