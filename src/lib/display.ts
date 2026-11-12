/**
 * Pure, transport-safe display helpers shared by the league dashboard,
 * member directory and league settings pages (Phase 1 / T5).
 *
 * No DB, no next/headers, no React — so they can be unit-tested directly and
 * imported from client components.
 */

/** The name fields we pull out of auth.users (see src/db/schema/auth.ts). */
export type NameSource = {
  email: string | null
  fullName: string | null
  name: string | null
  nickname: string | null
}

/**
 * Best available display name for a member.
 *
 * auth.users.raw_user_meta_data is GoTrue's JSONB bag; signup does not collect
 * a name yet, so email is the usual fallback (Phase 1 / T4 behaviour, kept
 * identical here).
 */
export function displayName(row: NameSource): string {
  return (
    row.fullName ?? row.name ?? row.nickname ?? row.email ?? 'Unknown member'
  )
}

/**
 * Turn a stored enum value into a label: 'co_commissioner' -> 'Co Commissioner',
 * 'best-ball' -> 'Best Ball'. Underscores, hyphens and spaces are all word
 * separators; only the first character of each word is capitalised so existing
 * casing inside a value is preserved.
 */
export function prettifyLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** 'Mar 4, 2026' — stable across time zones (UTC, like the T4 directory). */
export function formatDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** 'No members' / '1 member' / '7 members'. */
export function pluralizeCount(count: number, singular: string): string {
  if (count === 1) return `1 ${singular}`
  if (count === 0) return `No ${singular}s`
  return `${count} ${singular}s`
}
