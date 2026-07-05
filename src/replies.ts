// Reply validation. A reply is just a body (1–500 chars); threading is expressed by an optional
// parent_id the route resolves separately.

import { MAX_BODY_LENGTH } from './hashtags'

export type ReplyReason = 'empty_body' | 'body_too_long'

export type ReplyValidation =
  | { ok: true; body: string }
  | { ok: false; reason: ReplyReason }

export function validateReply(rawBody: unknown): ReplyValidation {
  const body = typeof rawBody === 'string' ? rawBody.trim() : ''
  if (body.length === 0) return { ok: false, reason: 'empty_body' }
  if (body.length > MAX_BODY_LENGTH) return { ok: false, reason: 'body_too_long' }
  return { ok: true, body }
}
