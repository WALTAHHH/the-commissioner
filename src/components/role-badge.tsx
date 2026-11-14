import { prettifyLabel } from '@/src/lib/display'

/**
 * Subtle-but-distinct styles per league role (UI-3).
 *
 * Commissioner = primary, co-commissioner = warning, everyone else neutral.
 * Unknown roles fall back to the neutral member treatment so a future enum
 * value degrades gracefully instead of rendering unstyled.
 */
const BADGE_STYLES: Record<string, string> = {
  commissioner:
    'border-primary/30 bg-primary/10 text-primary',
  co_commissioner:
    'border-warning/30 bg-warning/10 text-warning',
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
