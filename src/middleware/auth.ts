import type { NextFunction, Request, Response } from 'express'
import { getUserFromToken } from '../supabase'

/** Request augmented with the authenticated user's identity after `requireAuth`. */
export interface AuthedRequest extends Request {
  userId?: string
  userEmail?: string | null
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i

/**
 * Gate for authenticated routes. Reads `Authorization: Bearer <token>`, validates the
 * Supabase access token, and attaches `userId` / `userEmail` to the request. Responds
 * 401 on any failure. Errors are caught so an async rejection can't crash the process
 * (Express 4 does not forward async errors automatically).
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? ''
  const match = header.match(BEARER_PATTERN)
  if (!match) {
    res.status(401).json({ error: 'missing_bearer_token' })
    return
  }

  try {
    const user = await getUserFromToken(match[1]!)
    if (!user) {
      res.status(401).json({ error: 'invalid_token' })
      return
    }
    req.userId = user.id
    req.userEmail = user.email ?? null
    next()
  } catch (error) {
    // Misconfiguration (e.g. missing Supabase env) or an upstream outage lands here.
    res.status(500).json({ error: 'auth_check_failed', detail: messageOf(error) })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
