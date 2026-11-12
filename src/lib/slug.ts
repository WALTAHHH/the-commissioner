// URL-safe slug generation for league names.

/**
 * Convert a league name into a URL-safe slug:
 * lowercase, alphanumeric + hyphens only, no leading/trailing hyphens.
 * Falls back to "league" when the name has no slug-safe characters.
 */
export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFKD') // strip accents (é → e) before removing non-ascii
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-') // collapse runs of invalid chars into one hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
  return cleaned.slice(0, 48).replace(/-+$/, '') || 'league'
}

/**
 * Suffix like "a1b2" for collision disambiguation.
 */
export function randomSuffix(length = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}
