import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { toProfileResponse, type ProfileRow } from '../profileResponse'
import { db } from '../supabase'
import { validate } from '../username'

export const profileRouter = Router()

const IDENTITY_COLUMNS = 'id, username, display_name, bio, avatar_url, onboarded'

/**
 * GET /profile/username-available?u=<handle>
 * Live availability check for the onboarding handle field. Excludes the caller's own row so
 * re-checking their current handle reads as available.
 */
profileRouter.get('/profile/username-available', requireAuth, async (req: AuthedRequest, res) => {
  const raw = typeof req.query.u === 'string' ? req.query.u : ''
  const result = validate(raw)
  if (!result.ok) {
    res.json({ available: false, reason: result.reason })
    return
  }

  try {
    // Stored usernames are always normalized lowercase, so `eq` is an exact, case-correct match.
    // (Avoid `ilike` here — the handle can contain `_`, which ILIKE treats as a wildcard.)
    const { data, error } = await db()
      .from('profiles')
      .select('id')
      .eq('username', result.username)
      .neq('id', req.userId!)
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'availability_check_failed', detail: error.message })
      return
    }
    res.json(data == null ? { available: true } : { available: false, reason: 'taken' })
  } catch (error) {
    res.status(500).json({ error: 'availability_check_failed', detail: messageOf(error) })
  }
})

/**
 * POST /profile  { username, displayName, bio }
 * Claims the handle and marks the account onboarded. The DB's case-insensitive unique index
 * closes the check→submit race: a colliding claim fails with 23505 → 409 username_taken.
 */
profileRouter.post('/profile', requireAuth, async (req: AuthedRequest, res) => {
  const id = req.userId!
  const body = (req.body ?? {}) as Record<string, unknown>

  const usernameResult = validate(typeof body.username === 'string' ? body.username : '')
  if (!usernameResult.ok) {
    res.status(400).json({ error: 'invalid_username', reason: usernameResult.reason })
    return
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  if (displayName.length < 1 || displayName.length > 50) {
    res.status(400).json({ error: 'invalid_display_name' })
    return
  }

  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) : ''

  try {
    const { data, error } = await db()
      .from('profiles')
      .upsert(
        { id, username: usernameResult.username, display_name: displayName, bio, onboarded: true },
        { onConflict: 'id' },
      )
      .select(IDENTITY_COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'username_taken' })
        return
      }
      res.status(500).json({ error: 'profile_update_failed', detail: error.message })
      return
    }
    res.json(toProfileResponse(id, req.userEmail ?? null, data as ProfileRow))
  } catch (error) {
    res.status(500).json({ error: 'profile_update_failed', detail: messageOf(error) })
  }
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
