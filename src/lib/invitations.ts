/**
 * Invitation domain helpers (Phase 1 / T3).
 *
 * Pure logic only — no DB, no next/headers — so the validity rules can be
 * unit-tested directly. `use server` action files may only export async
 * functions, which is why these live here instead of in app/actions.
 */

/** Default link lifetime: 7 days (mirrors the column default in the schema). */
export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60

/** Longest lifetime we will honour, whatever a caller asks for (1 year). */
export const INVITATION_MAX_TTL_SECONDS = 365 * 24 * 60 * 60

export const INVITATION_ROUTE_PREFIX = '/invite/'

export type InvitationState = 'active' | 'revoked' | 'expired' | 'used_up'

/** The fields needed to decide whether a link can still be redeemed. */
export type InvitationValidity = {
  revokedAt: Date | null
  expiresAt: Date | null
  maxUses: number | null
  useCount: number | null
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tokens are UUIDs; anything longer is input noise, not one of our links. */
const MAX_TOKEN_LENGTH = 64

/** Same as UUID_REGEX but without anchors, for scanning inside larger text. */
export const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

/** Normalise a token coming from a URL segment or an action argument. */
export function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_TOKEN_LENGTH) return null
  return isUuid(trimmed) ? trimmed : null
}

/**
 * Pull the token out of whatever a user pastes: a full invite URL, a bare
 * /invite/<token> path, or the token itself. Returns null when no UUID
 * candidate is found so callers can show a friendly error instead of
 * navigating to a dead link.
 */
export function extractInviteToken(input: string): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. exact token (maybe the user already trimmed)
  const direct = normalizeToken(trimmed)
  if (direct) return direct

  // 2. path or URL containing /invite/<token>
  const prefixMatch = trimmed.match(/\/invite\/([0-9a-f][0-9a-f-]{30,})/i)
  if (prefixMatch) return normalizeToken(prefixMatch[1])

  // 3. any UUID inside the string (e.g. pasted chat text)
  const uuidMatch = trimmed.match(UUID_PATTERN)
  return uuidMatch ? normalizeToken(uuidMatch[0]) : null
}

/**
 * Derive the state of an invitation. Order matters: an expired link that was
 * later revoked reports as revoked (the more specific, admin-caused reason),
 * and a link that ran out of uses while still live reports as used_up.
 */
export function resolveInvitationState(
  invitation: InvitationValidity,
  now: Date = new Date()
): InvitationState {
  if (invitation.revokedAt) return 'revoked'
  if (!invitation.expiresAt || invitation.expiresAt.getTime() <= now.getTime()) {
    return 'expired'
  }
  if (invitation.maxUses !== null && (invitation.useCount ?? 0) >= invitation.maxUses) {
    return 'used_up'
  }
  return 'active'
}

export function isRedeemable(
  invitation: InvitationValidity,
  now: Date = new Date()
): boolean {
  return resolveInvitationState(invitation, now) === 'active'
}

/** Visitor-facing copy for each dead-link reason. */
export const INVITATION_STATE_MESSAGE: Record<Exclude<InvitationState, 'active'>, string> = {
  revoked: 'This invite link was cancelled by the commissioner.',
  expired: 'This invite link has expired.',
  used_up: 'This invite link has already been used to its limit.',
}

/** Relative path of the public invite page. */
export function invitationPath(token: string): string {
  return `${INVITATION_ROUTE_PREFIX}${encodeURIComponent(token)}`
}

/**
 * Shareable URL for a token. Absolute when the deployment tells us its public
 * origin (NEXT_PUBLIC_SITE_URL wins, then the request Origin header), relative
 * when it does not — a relative /invite/<token> is still usable in-app.
 *
 * `||`, not `??`: an unset-but-declared env var arrives as '' and must not
 * shadow the origin fallback.
 */
export function invitationShareUrl(token: string, origin?: string | null): string {
  const path = invitationPath(token)
  const rawBase = process.env.NEXT_PUBLIC_SITE_URL || origin || null
  if (!rawBase) return path

  try {
    const base = new URL(rawBase)
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return path
    return `${base.origin}${path}`
  } catch {
    return path
  }
}

/** Clamp a caller-supplied lifetime into a sane range and return its expiry. */
export function invitationExpiryFrom(
  expiresInSeconds: number | undefined,
  now: Date = new Date()
): Date {
  const seconds =
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
      ? Math.min(Math.floor(expiresInSeconds), INVITATION_MAX_TTL_SECONDS)
      : INVITATION_TTL_SECONDS

  return new Date(now.getTime() + seconds * 1000)
}

/** Normalise max_uses: undefined/null -> unlimited, otherwise a positive int. */
export function normalizeMaxUses(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return 'invalid'
  }
  return value >= 1 ? value : 'invalid'
}
