import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toSpaceResponse, type SpaceRow } from '../spaceResponse'
import { validateSpace } from '../spaces'
import { db } from '../supabase'

export const spacesRouter = Router()

const SPACE_COLUMNS = 'id, name, icon, hashtags, accent, created_at'

/**
 * GET /spaces — the caller's own Spaces, newest first. Spaces are private, so this is always
 * scoped to `owner_id = caller`.
 */
spacesRouter.get('/spaces', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db()
      .from('spaces')
      .select(SPACE_COLUMNS)
      .eq('owner_id', req.userId!)
      .order('created_at', { ascending: false })
    if (error) {
      res.status(500).json({ error: 'spaces_list_failed', detail: error.message })
      return
    }
    res.json({ spaces: (data as SpaceRow[]).map(toSpaceResponse) })
  } catch (error) {
    res.status(500).json({ error: 'spaces_list_failed', detail: messageOf(error) })
  }
})

/**
 * POST /spaces  { name, icon, hashtags, accent }
 * Creates a Space owned by the caller.
 */
spacesRouter.post('/spaces', requireAuth, async (req: AuthedRequest, res) => {
  const result = validateSpace((req.body ?? {}) as Record<string, unknown>)
  if (!result.ok) {
    res.status(400).json({ error: result.reason })
    return
  }

  try {
    const { data, error } = await db()
      .from('spaces')
      .insert({
        owner_id: req.userId!,
        name: result.name,
        icon: result.icon,
        hashtags: result.hashtags,
        accent: result.accent,
      })
      .select(SPACE_COLUMNS)
      .single()
    if (error) {
      res.status(500).json({ error: 'space_create_failed', detail: error.message })
      return
    }
    res.status(201).json(toSpaceResponse(data as SpaceRow))
  } catch (error) {
    res.status(500).json({ error: 'space_create_failed', detail: messageOf(error) })
  }
})

/**
 * PATCH /spaces/:id  { name, icon, hashtags, accent }
 * Full-object update of a Space the caller owns. Unknown/other-owner id → 404.
 */
spacesRouter.patch('/spaces/:id', requireAuth, async (req: AuthedRequest, res) => {
  const result = validateSpace((req.body ?? {}) as Record<string, unknown>)
  if (!result.ok) {
    res.status(400).json({ error: result.reason })
    return
  }

  try {
    const { data, error } = await db()
      .from('spaces')
      .update({
        name: result.name,
        icon: result.icon,
        hashtags: result.hashtags,
        accent: result.accent,
      })
      .eq('id', req.params.id)
      .eq('owner_id', req.userId!)
      .select(SPACE_COLUMNS)
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'space_update_failed', detail: error.message })
      return
    }
    if (!data) {
      res.status(404).json({ error: 'space_not_found' })
      return
    }
    res.json(toSpaceResponse(data as SpaceRow))
  } catch (error) {
    res.status(500).json({ error: 'space_update_failed', detail: messageOf(error) })
  }
})

/**
 * DELETE /spaces/:id — deletes a Space the caller owns. Returns the deleted id (200) so the
 * client can decode a uniform JSON body; unknown/other-owner id → 404.
 */
spacesRouter.delete('/spaces/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db()
      .from('spaces')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_id', req.userId!)
      .select('id')
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'space_delete_failed', detail: error.message })
      return
    }
    if (!data) {
      res.status(404).json({ error: 'space_not_found' })
      return
    }
    res.json({ id: (data as { id: string }).id })
  } catch (error) {
    res.status(500).json({ error: 'space_delete_failed', detail: messageOf(error) })
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
