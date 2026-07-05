import { Router } from 'express'
import { validateReply } from '../replies'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toReplyResponse, type ReplyRow } from '../replyResponse'
import { db } from '../supabase'

export const repliesRouter = Router()

// Pin the author embed to the FK (see the posts embed lesson — `replies` also links posts↔profiles,
// so un-hinted embeds get ambiguous).
const REPLY_COLUMNS =
  'id, post_id, parent_id, body, created_at, like_count, author:profiles!replies_author_id_fkey(username, display_name, avatar_url)'

const THREAD_LIMIT = 500

/** Shapes reply rows, resolving `likedByMe` for the caller in one extra query per thread page. */
async function withReplyLikeState(rows: ReplyRow[], userId: string) {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const { data, error } = await db()
    .from('reply_likes')
    .select('reply_id')
    .eq('user_id', userId)
    .in('reply_id', ids)
  if (error) throw new Error(error.message)
  const liked = new Set((data as { reply_id: string }[]).map((like) => like.reply_id))
  return rows.map((row) => toReplyResponse(row, liked.has(row.id)))
}

/** The fresh like state of one reply for one caller — the like/unlike routes' return value. */
async function replyLikeState(replyId: string, userId: string) {
  const { data: reply, error: replyError } = await db()
    .from('replies')
    .select('like_count')
    .eq('id', replyId)
    .maybeSingle()
  if (replyError) throw new Error(replyError.message)
  if (!reply) return null

  const { data: like, error: likeError } = await db()
    .from('reply_likes')
    .select('reply_id')
    .eq('reply_id', replyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (likeError) throw new Error(likeError.message)

  return {
    id: replyId,
    likeCount: (reply as { like_count: number }).like_count ?? 0,
    likedByMe: like != null,
  }
}

/**
 * GET /posts/:id/replies — every reply in a post's thread, oldest-first (the client assembles the
 * tree from `parentId`).
 */
repliesRouter.get('/posts/:id/replies', requireAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id ?? ''
  try {
    const { data, error } = await db()
      .from('replies')
      .select(REPLY_COLUMNS)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(THREAD_LIMIT)
    if (error) {
      res.status(500).json({ error: 'replies_list_failed', detail: error.message })
      return
    }
    res.json({ replies: await withReplyLikeState(data as unknown as ReplyRow[], req.userId!) })
  } catch (error) {
    res.status(500).json({ error: 'replies_list_failed', detail: messageOf(error) })
  }
})

/**
 * POST /posts/:id/replies  { body, parentId? }
 * Adds a reply. `parentId` (another reply) must belong to the same post. Requires a profile.
 */
repliesRouter.post('/posts/:id/replies', requireAuth, async (req: AuthedRequest, res) => {
  const authorId = req.userId!
  const postId = req.params.id ?? ''
  const body = (req.body ?? {}) as Record<string, unknown>

  const result = validateReply(body.body)
  if (!result.ok) {
    res.status(400).json({ error: result.reason })
    return
  }
  const parentId = typeof body.parentId === 'string' && body.parentId.length > 0 ? body.parentId : null

  try {
    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('onboarded')
      .eq('id', authorId)
      .maybeSingle()
    if (profileError) {
      res.status(500).json({ error: 'reply_create_failed', detail: profileError.message })
      return
    }
    if (!profile?.onboarded) {
      res.status(403).json({ error: 'profile_required' })
      return
    }

    // The post must exist; a parent reply, if given, must belong to this same post.
    const { data: post, error: postError } = await db()
      .from('posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle()
    if (postError) {
      res.status(500).json({ error: 'reply_create_failed', detail: postError.message })
      return
    }
    if (!post) {
      res.status(404).json({ error: 'post_not_found' })
      return
    }
    if (parentId) {
      const { data: parent, error: parentError } = await db()
        .from('replies')
        .select('id')
        .eq('id', parentId)
        .eq('post_id', postId)
        .maybeSingle()
      if (parentError) {
        res.status(500).json({ error: 'reply_create_failed', detail: parentError.message })
        return
      }
      if (!parent) {
        res.status(400).json({ error: 'invalid_parent' })
        return
      }
    }

    const { data, error } = await db()
      .from('replies')
      .insert({ post_id: postId, parent_id: parentId, author_id: authorId, body: result.body })
      .select(REPLY_COLUMNS)
      .single()
    if (error) {
      res.status(500).json({ error: 'reply_create_failed', detail: error.message })
      return
    }
    res.status(201).json(toReplyResponse(data as unknown as ReplyRow, false))
  } catch (error) {
    res.status(500).json({ error: 'reply_create_failed', detail: messageOf(error) })
  }
})

/**
 * POST /replies/:id/like — likes a reply (idempotent). Returns `{ id, likeCount, likedByMe }`.
 */
repliesRouter.post('/replies/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const replyId = req.params.id ?? ''

  try {
    const { error } = await db()
      .from('reply_likes')
      .upsert({ reply_id: replyId, user_id: userId }, { onConflict: 'reply_id,user_id', ignoreDuplicates: true })
    if (error) {
      if (error.code === '23503') {
        res.status(404).json({ error: 'reply_not_found' })
        return
      }
      res.status(500).json({ error: 'like_failed', detail: error.message })
      return
    }
    const state = await replyLikeState(replyId, userId)
    if (!state) {
      res.status(404).json({ error: 'reply_not_found' })
      return
    }
    res.json(state)
  } catch (error) {
    res.status(500).json({ error: 'like_failed', detail: messageOf(error) })
  }
})

/**
 * DELETE /replies/:id/like — removes the caller's like (idempotent). Returns the fresh like state.
 */
repliesRouter.delete('/replies/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const replyId = req.params.id ?? ''

  try {
    const { error } = await db()
      .from('reply_likes')
      .delete()
      .eq('reply_id', replyId)
      .eq('user_id', userId)
    if (error) {
      res.status(500).json({ error: 'unlike_failed', detail: error.message })
      return
    }
    const state = await replyLikeState(replyId, userId)
    if (!state) {
      res.status(404).json({ error: 'reply_not_found' })
      return
    }
    res.json(state)
  } catch (error) {
    res.status(500).json({ error: 'unlike_failed', detail: messageOf(error) })
  }
})

/**
 * DELETE /replies/:id — deletes a reply the caller owns; its subtree cascades. Returns the id.
 */
repliesRouter.delete('/replies/:id', requireAuth, async (req: AuthedRequest, res) => {
  const authorId = req.userId!
  const replyId = req.params.id ?? ''

  try {
    const { data, error } = await db()
      .from('replies')
      .delete()
      .eq('id', replyId)
      .eq('author_id', authorId)
      .select('id')
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'reply_delete_failed', detail: error.message })
      return
    }
    if (!data) {
      res.status(404).json({ error: 'reply_not_found' })
      return
    }
    res.json({ id: (data as { id: string }).id })
  } catch (error) {
    res.status(500).json({ error: 'reply_delete_failed', detail: messageOf(error) })
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
