// Post content rules — the authoritative copy. Mirrored (for UX) by the iOS composer's
// `HashtagRules`. Hashtags are stored bare (no leading '#'), lowercased, and deduped.

export const MAX_HASHTAGS = 6
export const MAX_BODY_LENGTH = 500

// A tag after normalization: 1–30 chars of a–z, 0–9, or underscore.
const HASHTAG_RE = /^[a-z0-9_]{1,30}$/

/** Normalizes one raw tag to its storage form, or null if it can't be a valid tag. */
export function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').toLowerCase()
  return HASHTAG_RE.test(tag) ? tag : null
}

export type PostReason =
  | 'empty_body'
  | 'body_too_long'
  | 'too_many_hashtags'
  | 'invalid_hashtag'

export type PostValidation =
  | { ok: true; body: string; hashtags: string[] }
  | { ok: false; reason: PostReason }

/**
 * Validates and normalizes a create-post payload. Trims the body, normalizes and
 * de-duplicates hashtags (preserving first-seen order), and enforces MAX_HASHTAGS.
 * An unparseable tag is a hard error rather than being silently dropped, so the client
 * gets clear feedback instead of a post that quietly lost a tag.
 */
export function validatePost(rawBody: unknown, rawHashtags: unknown): PostValidation {
  const body = typeof rawBody === 'string' ? rawBody.trim() : ''
  if (body.length === 0) return { ok: false, reason: 'empty_body' }
  if (body.length > MAX_BODY_LENGTH) return { ok: false, reason: 'body_too_long' }

  const input = Array.isArray(rawHashtags) ? rawHashtags : []
  const seen = new Set<string>()
  const hashtags: string[] = []
  for (const item of input) {
    if (typeof item !== 'string' || item.trim() === '') continue
    const tag = normalizeHashtag(item)
    if (tag === null) return { ok: false, reason: 'invalid_hashtag' }
    if (seen.has(tag)) continue
    seen.add(tag)
    hashtags.push(tag)
  }
  if (hashtags.length > MAX_HASHTAGS) return { ok: false, reason: 'too_many_hashtags' }

  return { ok: true, body, hashtags }
}
