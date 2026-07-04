import 'dotenv/config'

/**
 * Environment configuration. Values are read once at import; validation is deferred
 * (see `assertSupabaseConfigured`) so the process can still boot and serve `/health`
 * even when Supabase credentials are absent — useful for smoke tests and early deploys.
 */
export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  port: Number(process.env.PORT ?? 8080),
} as const

const REQUIRED_SUPABASE_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

/** Throws a clear error if any Supabase credential is missing. Called lazily by data paths. */
export function assertSupabaseConfigured(): void {
  const missing = REQUIRED_SUPABASE_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Supabase is not configured. Missing env var(s): ${missing.join(', ')}`)
  }
}
