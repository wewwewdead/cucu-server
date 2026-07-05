import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'
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

// --- Token verification keys ---------------------------------------------------------------
//
// A Supabase project signs user access tokens one of two ways, and the two coexist:
//   • Legacy: HS256, using the shared "JWT Secret" (Settings → API). The anon/service API keys
//     are also HS256 JWTs signed with this secret.
//   • JWT Signing Keys: asymmetric (ES256/RS256/EdDSA). The private key stays in Supabase; the
//     public keys are published, unauthenticated, at /auth/v1/.well-known/jwks.json.
//
// IMPORTANT: enabling asymmetric signing does NOT change the anon/service keys — those stay
// HS256. So we cannot infer the user-token algorithm from the API keys; we read each token's
// own header (`alg`) and verify with the matching key. This is why HS256-only verification
// silently 401s a project that has switched to ES256 — the algorithms never match.

let sharedSecret: Uint8Array | null = null
function secretKey(): Uint8Array {
  assertJwtConfigured()
  sharedSecret ??= new TextEncoder().encode(env.supabaseJwtSecret)
  return sharedSecret
}

// Verifier for asymmetric tokens. `jose` fetches the JWKS lazily, caches it, and refetches on an
// unseen key id, so one instance serves the whole process.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function projectJwks(): ReturnType<typeof createRemoteJWKSet> {
  assertSupabaseConfigured() // needs SUPABASE_URL
  jwks ??= createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', env.supabaseUrl))
  return jwks
}

/**
 * Validates a Supabase access token **locally** (no round trip to Supabase per request) and
 * returns the user, or null if the token is invalid/expired. Handles BOTH signing schemes by
 * reading the token's `alg`: HS256 → shared secret; anything else → the project's JWKS.
 * Enforces the `authenticated` audience so anon/service keys can't pass as users.
 *
 * Trade-off: local verification can't observe server-side revocation, but Supabase access tokens
 * are short-lived (~1h), the standard trade-off for skipping the round trip.
 */
export async function getUserFromToken(token: string): Promise<AuthedUser | null> {
  let alg: string
  try {
    alg = decodeProtectedHeader(token).alg ?? ''
  } catch {
    return null // not a well-formed JWS
  }

  // Assert the needed config BEFORE verifying so a genuine misconfig surfaces as a clear 500,
  // while a bad/rejected token below returns null → 401.
  if (alg === 'HS256') {
    assertJwtConfigured()
  } else {
    assertSupabaseConfigured()
  }

  try {
    const { payload } =
      alg === 'HS256'
        ? await jwtVerify(token, secretKey(), { audience: 'authenticated' })
        : await jwtVerify(token, projectJwks(), { audience: 'authenticated' })
    if (typeof payload.sub !== 'string') return null
    const email = typeof payload.email === 'string' ? payload.email : null
    return { id: payload.sub, email }
  } catch (error) {
    // Surface the reason so a misconfig is diagnosable in the Railway logs (alg mismatch, bad
    // signature, wrong audience, expiry) instead of an opaque 401.
    // eslint-disable-next-line no-console
    console.warn(`[auth] token verification failed (alg=${alg || 'unknown'}): ${messageOf(error)}`)
    return null
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
