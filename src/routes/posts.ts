import { Router } from 'express'
import { validatePost } from '../hashtags'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toPostResponse, type PostRow } from '../postResponse'
import { db } from '../supabase'
import { normalize as normalizeUsername } from '../username'

export const postsRouter = Router()

// Post row + the author's public identity + the denormalized like counter.
const POST_COLUMNS =
  'id, body, hashtags, created_at, like_count, author:profiles(username, display_name, avatar_url)'

const FEED_LIMIT = 50

/**
 * Shapes rows into responses, resolving `likedByMe` for the caller. One extra indexed query per
 * page (the caller's likes among these post ids) rather than N per-post checks.
 */
async function withLikeState(rows: PostRow[], userId: string) {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const { data, error } = await db()
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', ids)
  if (error) throw new Error(error.message)
  const liked = new Set((data as { post_id: string }[]).map((like) => like.post_id))
  return rows.map((row) => toPostResponse(row, liked.has(row.id)))
}

/** The fresh like state of one post for one caller — the like/unlike routes' return value. */
async function likeState(postId: string, userId: string) {
  const { data: post, error: postError } = await db()
    .from('posts')
    .select('like_count')
    .eq('id', postId)
    .maybeSingle()
  if (postError) throw new Error(postError.message)
  if (!post) return null

  const { data: like, error: likeError } = await db()
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  if (likeError) throw new Error(likeError.message)

  return {
    id: postId,
    likeCount: (post as { like_count: number }).like_count ?? 0,
    likedByMe: like != null,
  }
}

/**
 * POST /posts  { body, hashtags }
 * Creates a text post authored by the caller. Requires a completed profile.
 */
postsRouter.post('/posts', requireAuth, async (req: AuthedRequest, res) => {
  const authorId = req.userId!
  const body = (req.body ?? {}) as Record<string, unknown>

  const result = validatePost(body.body, body.hashtags)
  if (!result.ok) {
    res.status(400).json({ error: result.reason })
    return
  }

  try {
    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('onboarded')
      .eq('id', authorId)
      .maybeSingle()
    if (profileError) {
      res.status(500).json({ error: 'post_create_failed', detail: profileError.message })
      return
    }
    if (!profile?.onboarded) {
      res.status(403).json({ error: 'profile_required' })
      return
    }

    const { data, error } = await db()
      .from('posts')
      .insert({ author_id: authorId, body: result.body, hashtags: result.hashtags })
      .select(POST_COLUMNS)
      .single()
    if (error) {
      res.status(500).json({ error: 'post_create_failed', detail: error.message })
      return
    }
    // A brand-new post has no likes and isn't liked by its author.
    res.status(201).json(toPostResponse(data as unknown as PostRow, false))
  } catch (error) {
    res.status(500).json({ error: 'post_create_failed', detail: messageOf(error) })
  }
})

/**
 * GET /posts/feed — the most recent posts across everyone, newest first.
 * (Registered before `/posts/:id` so ":id" doesn't capture "feed".)
 */
postsRouter.get('/posts/feed', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db()
      .from('posts')
      .select(POST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
    if (error) {
      res.status(500).json({ error: 'feed_failed', detail: error.message })
      return
    }
    res.json({ posts: await withLikeState(data as unknown as PostRow[], req.userId!) })
  } catch (error) {
    res.status(500).json({ error: 'feed_failed', detail: messageOf(error) })
  }
})

/**
 * GET /posts/by/:username — one user's posts (their profile feed), newest first.
 */
postsRouter.get('/posts/by/:username', requireAuth, async (req: AuthedRequest, res) => {
  const username = normalizeUsername(typeof req.params.username === 'string' ? req.params.username : '')

  try {
    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (profileError) {
      res.status(500).json({ error: 'author_lookup_failed', detail: profileError.message })
      return
    }
    if (!profile) {
      res.json({ posts: [] })
      return
    }

    const { data, error } = await db()
      .from('posts')
      .select(POST_COLUMNS)
      .eq('author_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
    if (error) {
      res.status(500).json({ error: 'author_feed_failed', detail: error.message })
      return
    }
    res.json({ posts: await withLikeState(data as unknown as PostRow[], req.userId!) })
  } catch (error) {
    res.status(500).json({ error: 'author_feed_failed', detail: messageOf(error) })
  }
})

/**
 * POST /posts/:id/like — likes a post (idempotent; liking twice is a no-op). Returns the fresh
 * like state `{ id, likeCount, likedByMe }`.
 */
postsRouter.post('/posts/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const postId = req.params.id ?? ''

  try {
    const { error } = await db()
      .from('post_likes')
      .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
    if (error) {
      if (error.code === '23503') {
        res.status(404).json({ error: 'post_not_found' })
        return
      }
      res.status(500).json({ error: 'like_failed', detail: error.message })
      return
    }
    const state = await likeState(postId, userId)
    if (!state) {
      res.status(404).json({ error: 'post_not_found' })
      return
    }
    res.json(state)
  } catch (error) {
    res.status(500).json({ error: 'like_failed', detail: messageOf(error) })
  }
})

/**
 * DELETE /posts/:id/like — removes the caller's like (idempotent). Returns the fresh like state.
 */
postsRouter.delete('/posts/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const postId = req.params.id ?? ''

  try {
    const { error } = await db()
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
    if (error) {
      res.status(500).json({ error: 'unlike_failed', detail: error.message })
      return
    }
    const state = await likeState(postId, userId)
    if (!state) {
      res.status(404).json({ error: 'post_not_found' })
      return
    }
    res.json(state)
  } catch (error) {
    res.status(500).json({ error: 'unlike_failed', detail: messageOf(error) })
  }
})

/**
 * GET /posts/:id — a single post. The permalink target for shared `cucu://post/<id>` links.
 */
postsRouter.get('/posts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''

  try {
    const { data, error } = await db()
      .from('posts')
      .select(POST_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'post_fetch_failed', detail: error.message })
      return
    }
    if (!data) {
      res.status(404).json({ error: 'post_not_found' })
      return
    }
    const [response] = await withLikeState([data as unknown as PostRow], req.userId!)
    res.json(response)
  } catch (error) {
    res.status(500).json({ error: 'post_fetch_failed', detail: messageOf(error) })
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
