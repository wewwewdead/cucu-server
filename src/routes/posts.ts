import { Router } from 'express'
import { validatePost } from '../hashtags'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toPostResponse, type PostRow } from '../postResponse'
import { db } from '../supabase'
import { normalize as normalizeUsername } from '../username'

export const postsRouter = Router()

// Post row + the author's public identity, embedded via the posts.author_id → profiles FK.
const POST_COLUMNS = 'id, body, hashtags, created_at, author:profiles(username, display_name, avatar_url)'

const FEED_LIMIT = 50

/**
 * POST /posts  { body, hashtags }
 * Creates a text post authored by the caller. Requires a completed profile (posts are
 * attributed to a @handle). Body + hashtags are validated/normalized server-side — the
 * 6-hashtag cap is enforced here and by a DB CHECK constraint.
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
    res.status(201).json(toPostResponse(data as unknown as PostRow))
  } catch (error) {
    res.status(500).json({ error: 'post_create_failed', detail: messageOf(error) })
  }
})

/**
 * GET /posts/feed — the most recent posts across everyone, newest first.
 * (Registered before `/posts/:id` so ":id" doesn't capture "feed".)
 */
postsRouter.get('/posts/feed', requireAuth, async (_req: AuthedRequest, res) => {
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
    res.json({ posts: (data as unknown as PostRow[]).map(toPostResponse) })
  } catch (error) {
    res.status(500).json({ error: 'feed_failed', detail: messageOf(error) })
  }
})

/**
 * GET /posts/by/:username — one user's posts (their profile feed), newest first.
 * Unknown handle → an empty list rather than a 404, so a profile with no posts renders cleanly.
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
    res.json({ posts: (data as unknown as PostRow[]).map(toPostResponse) })
  } catch (error) {
    res.status(500).json({ error: 'author_feed_failed', detail: messageOf(error) })
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
    res.json(toPostResponse(data as unknown as PostRow))
  } catch (error) {
    res.status(500).json({ error: 'post_fetch_failed', detail: messageOf(error) })
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
