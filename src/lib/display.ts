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

/**
 * US dollar amount for every money surface (finances hub, ledger, prizes).
 * Amounts are dollars (numeric(12,2) at the DB, number at this boundary).
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/**
 * '2 hours ago' style timestamp for the activity feed; falls back to the
 * absolute date past a week. Clock skew (a row stamped slightly in the
 * future by the DB) renders as 'just now' rather than a negative count.
 */
export function formatRelativeTime(
  value: Date,
  now: Date = new Date(),
): string {
  const seconds = Math.floor((now.getTime() - value.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

/** 'No members' / '1 member' / '7 members'. */
export function pluralizeCount(count: number, singular: string): string {
  if (count === 1) return `1 ${singular}`
  if (count === 0) return `No ${singular}s`
  return `${count} ${singular}s`
}
