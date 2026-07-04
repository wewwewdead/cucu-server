import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { assertSupabaseConfigured, env } from './env'

// Clients are created lazily so the process can boot without credentials (see env.ts).
let adminClient: SupabaseClient | null = null
let anonClient: SupabaseClient | null = null

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

function anon(): SupabaseClient {
  assertSupabaseConfigured()
  anonClient ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return anonClient
}

/**
 * Validates a Supabase-issued access token by asking Supabase Auth to resolve it.
 * Works regardless of the project's JWT signing algorithm (HS256 or asymmetric keys),
 * so there is no JWT secret / JWKS to manage here. Returns the user, or null if invalid.
 */
export async function getUserFromToken(token: string): Promise<User | null> {
  const { data, error } = await anon().auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
