/**
 * Return-URL handling for the auth pages (Phase 1 / T3).
 *
 * /invite/[token] sends signed-out visitors to /login?next=/invite/<token>;
 * the auth pages need to honour that parameter without turning it into an open
 * redirect. Only same-origin absolute paths are accepted.
 *
 * Client-side only (reads window.location) so the login/signup pages can stay
 * plain client components without a Suspense boundary for useSearchParams.
 */

/** Reject anything that is not a safe in-app path: no //host, no scheme, no backslash. */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (raw.includes('\\')) return null
  if (raw.includes('://')) return null
  if (raw.includes('\n') || raw.includes('\r')) return null

  // Normalise through the URL parser so ../ segments cannot smuggle a host.
  try {
    const parsed = new URL(raw, 'http://localhost.invalid')
    if (parsed.origin !== 'http://localhost.invalid') return null
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    return path.length > 1 ? path : null
  } catch {
    return null
  }
}

/**
 * Where to send the user after a successful sign in / sign up: the `next`
 * query parameter when it is a safe in-app path, otherwise `fallback`.
 */
export function returnToAfterAuth(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback
  const raw = new URLSearchParams(window.location.search).get('next')
  return safeReturnTo(raw) ?? fallback
}
