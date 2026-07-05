// Space validation rules. Reuses the post hashtag normalizer so a Space's tags match how posts
// store theirs. A Space needs at least one hashtag (that's what it filters on) and at most 12.

import { normalizeHashtag } from './hashtags'

export const MAX_SPACE_HASHTAGS = 12
export const MAX_SPACE_NAME = 50

// The accent palette the client offers. Anything else falls back to the first entry.
export const SPACE_ACCENTS = [
  'pink', 'orange', 'mint', 'purple', 'cyan', 'blue', 'indigo', 'teal', 'red', 'green',
] as const
export type SpaceAccent = (typeof SPACE_ACCENTS)[number]

export type SpaceReason =
  | 'empty_name'
  | 'name_too_long'
  | 'no_hashtags'
  | 'too_many_hashtags'
  | 'invalid_hashtag'

export type SpaceValidation =
  | { ok: true; name: string; icon: string; hashtags: string[]; accent: SpaceAccent }
  | { ok: false; reason: SpaceReason }

/**
 * Validates + normalizes a create/update Space payload: trims the name, normalizes and
 * de-duplicates hashtags (first-seen order), clamps the icon, and coerces the accent to the
 * palette. Used by both POST and PATCH (full-object semantics).
 */
export function validateSpace(body: Record<string, unknown>): SpaceValidation {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length === 0) return { ok: false, reason: 'empty_name' }
  if (name.length > MAX_SPACE_NAME) return { ok: false, reason: 'name_too_long' }

  const rawTags = Array.isArray(body.hashtags) ? body.hashtags : []
  const seen = new Set<string>()
  const hashtags: string[] = []
  for (const item of rawTags) {
    if (typeof item !== 'string' || item.trim() === '') continue
    const tag = normalizeHashtag(item)
    if (tag === null) return { ok: false, reason: 'invalid_hashtag' }
    if (seen.has(tag)) continue
    seen.add(tag)
    hashtags.push(tag)
  }
  if (hashtags.length === 0) return { ok: false, reason: 'no_hashtags' }
  if (hashtags.length > MAX_SPACE_HASHTAGS) return { ok: false, reason: 'too_many_hashtags' }

  // Icon is a short glyph (emoji). Keep it small; empty is fine (the client shows a fallback).
  const icon = typeof body.icon === 'string' ? body.icon.trim().slice(0, 8) : ''

  const accentRaw = typeof body.accent === 'string' ? body.accent.trim().toLowerCase() : ''
  const accent: SpaceAccent = (SPACE_ACCENTS as readonly string[]).includes(accentRaw)
    ? (accentRaw as SpaceAccent)
    : SPACE_ACCENTS[0]

  return { ok: true, name, icon, hashtags, accent }
}
