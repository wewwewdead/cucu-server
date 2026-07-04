// Username rules — kept in sync with the client's `ProfileSocialUsername` (lowercase a–z 0–9 . _).

const USERNAME_RE = /^[a-z0-9._]{3,30}$/

const RESERVED = new Set([
  'admin', 'api', 'me', 'cucu', 'support', 'settings',
  'about', 'help', 'root', 'null', 'undefined', 'profile',
])

export type UsernameReason = 'invalid' | 'reserved'

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameReason }

export function normalize(input: string): string {
  return input.trim().toLowerCase()
}

/** Validates and normalizes a handle. Stored values are always the normalized (lowercase) form. */
export function validate(input: string): UsernameValidation {
  const username = normalize(input)
  if (!USERNAME_RE.test(username)) return { ok: false, reason: 'invalid' }
  if (RESERVED.has(username)) return { ok: false, reason: 'reserved' }
  return { ok: true, username }
}
