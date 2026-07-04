import 'dotenv/config'

/**
 * Environment configuration. Values are read once at import; validation is deferred (see the
 * `assert*` helpers) so the process can still boot and serve `/health` without credentials.
 */
export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  port: Number(process.env.PORT ?? 8080),
} as const

// Data access (the service-role client) needs the URL + service-role key.
const REQUIRED_DB_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

/** Throws if the database credentials are missing. Called lazily by data paths. */
export function assertSupabaseConfigured(): void {
  const missing = REQUIRED_DB_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Supabase is not configured. Missing env var(s): ${missing.join(', ')}`)
  }
}

/** Throws if the JWT secret (Supabase → Settings → API → JWT Secret) is missing. */
export function assertJwtConfigured(): void {
  if (!process.env.SUPABASE_JWT_SECRET) {
    throw new Error('Token verification is not configured. Missing env var: SUPABASE_JWT_SECRET')
  }
}
