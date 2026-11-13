import { prettifyLabel } from '@/src/lib/display'

/**
 * Subtle-but-distinct styles per league role (UI-3).
 *
 * Commissioner = blue, co-commissioner = purple, everyone else neutral.
 * Unknown roles fall back to the neutral member treatment so a future enum
 * value degrades gracefully instead of rendering unstyled.
 */
const BADGE_STYLES: Record<string, string> = {
  commissioner:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/70 dark:bg-blue-900/30 dark:text-blue-300',
  co_commissioner:
    'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800/70 dark:bg-purple-900/30 dark:text-purple-300',
  member: 'border-border bg-muted text-muted-foreground',
}

export function roleBadgeClass(role: string): string {
  return BADGE_STYLES[role] ?? BADGE_STYLES.member
}

export default function RoleBadge({
  role,
  className = '',
}: {
  role: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(role)}${className ? ` ${className}` : ''}`}
    >
      {prettifyLabel(role)}
    </span>
  )
}
