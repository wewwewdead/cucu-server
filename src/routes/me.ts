import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth'
import { db } from '../supabase'

export const meRouter = Router()

/**
 * GET /me — the identity handshake.
 *
 * Verifies the caller's Supabase token (via `requireAuth`), ensures an account row
 * exists (created on first sign-in), and reports whether the user has completed profile
 * creation. `hasProfile` is the signal the app uses to route a brand-new user into the
 * "create profile" phase.
 */
meRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const id = req.userId!

  try {
    // Idempotent: create the account row the first time we see this user, no-op after.
    const { error: upsertError } = await db()
      .from('profiles')
      .upsert({ id }, { onConflict: 'id', ignoreDuplicates: true })
    if (upsertError) {
      res.status(500).json({ error: 'profile_upsert_failed', detail: upsertError.message })
      return
    }

    const { data, error } = await db()
      .from('profiles')
      .select('id, onboarded')
      .eq('id', id)
      .single()
    if (error) {
      res.status(500).json({ error: 'profile_fetch_failed', detail: error.message })
      return
    }

    res.json({
      id,
      email: req.userEmail ?? null,
      hasProfile: data?.onboarded ?? false,
    })
  } catch (error) {
    res.status(500).json({
      error: 'me_failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
})
