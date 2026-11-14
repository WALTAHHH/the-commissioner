import { prettifyLabel } from '@/src/lib/display'

/**
 * Pending badge for placeholder members (migration 0010).
 *
 * Replaces RoleBadge on slot rows: a reserved seat has no account, so its
 * "role" is a promise, not a state — the amber Pending chip is the directory
 * signal (same warning tokens as the co-commissioner badge, so it reads as
 * part of the family). The intended role is still visible: the directory
 * renders it as a muted "intended: Treasurer" suffix next to the badge.
 */
export default function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-warning"
      />
      Pending
    </span>
  )
}

/** "intended: treasurer" suffix — only shown when the slot parked a non-default role. */
export function IntendedRoleSuffix({ role }: { role: string }) {
  if (!role || role === 'member') return null
  return (
    <span className="text-xs text-muted-foreground">
      · intended {prettifyLabel(role).toLowerCase()}
    </span>
  )
}
