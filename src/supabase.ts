import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { assertJwtConfigured, assertSupabaseConfigured, env } from './env'

// Created lazily so the process can boot without credentials (see env.ts).
let adminClient: SupabaseClient | null = null

/**
 * Service-role client: full database access, bypasses Row-Level Security.
 * SERVER-ONLY. The service-role key must never reach the app.
 */
export function db(): SupabaseClient {
  assertSupabaseConfigured()
  adminClient ??= createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}

export interface AuthedUser {
  id: string
  email: string | null
}

let jwtKey: Uint8Array | null = null
function secretKey(): Uint8Array {
  assertJwtConfigured()
  jwtKey ??= new TextEncoder().encode(env.supabaseJwtSecret)
  return jwtKey
}

/**
 * Validates a Supabase access token **locally** with the project's JWT secret (HS256) — no
 * round trip to Supabase per request. Enforces the `authenticated` audience so the anon and
 * service keys (signed with the same secret) can't pass as users. Returns the user, or null
 * if the token is invalid/expired.
 *
 * Trade-off: local verification can't observe server-side revocation, but Supabase access
 * tokens are short-lived (~1h), which is the standard trade-off for skipping the round trip.
 * If the project ever moves to asymmetric JWT signing keys, swap this for JWKS verification
 * (`jose`'s `createRemoteJWKSet`).
 */
export async function getUserFromToken(token: string): Promise<AuthedUser | null> {
  const key = secretKey() // throws on misconfig → surfaced as a 500 by the auth middleware
  try {
    const { payload } = await jwtVerify(token, key, { audience: 'authenticated' })
    if (typeof payload.sub !== 'string') return null
    const email = typeof payload.email === 'string' ? payload.email : null
    return { id: payload.sub, email }
  } catch {
    return null
  }
}
