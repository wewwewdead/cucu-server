import { Router } from 'express'
import { validateReply } from '../replies'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toReplyResponse, type ReplyRow } from '../replyResponse'
import { db } from '../supabase'

export const repliesRouter = Router()

// Pin the author embed to the FK (see the posts embed lesson — `replies` also links posts↔profiles,
// so un-hinted embeds get ambiguous).
const REPLY_COLUMNS =
  'id, post_id, parent_id, body, created_at, author:profiles!replies_author_id_fkey(username, display_name, avatar_url)'

const THREAD_LIMIT = 500

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
    res.json({ replies: (data as unknown as ReplyRow[]).map(toReplyResponse) })
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
    res.status(201).json(toReplyResponse(data as unknown as ReplyRow))
  } catch (error) {
    res.status(500).json({ error: 'reply_create_failed', detail: messageOf(error) })
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
