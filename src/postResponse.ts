// Shared shape for a post payload returned by the posts routes. Mirrors the client's `PostDTO`.

export interface PostAuthorRow {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export interface PostRow {
  id: string
  body: string
  hashtags: string[] | null
  created_at: string
  like_count: number | null
  // PostgREST returns an embedded to-one relation as an object, but the generated types are
  // loose — guard for the array case defensively.
  author: PostAuthorRow | PostAuthorRow[] | null
}

/** `likedByMe` is resolved per-caller by the route (from `post_likes`) and passed in. */
export function toPostResponse(row: PostRow, likedByMe: boolean) {
  const author = Array.isArray(row.author) ? (row.author[0] ?? null) : row.author
  return {
    id: row.id,
    body: row.body,
    hashtags: row.hashtags ?? [],
    // Normalize to a strict ISO-8601 string with millis + 'Z' so the client's date parser
    // has a single, predictable format to decode.
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
