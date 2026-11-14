import type { DisplayObligationStatus } from '@/src/lib/finances'

/**
 * Obligation/payment status badge (Finances-2).
 *
 * Pending muted, Received green, Disputed red, Partial amber — 'partial' is
 * derived in the read layer (some 'received' money but less than the full
 * amount); it is never a stored value. Colors use the design-system tokens
 * (success/warning/destructive), matching the members-page badges.
 */

const STATUS_STYLES: Record<
  DisplayObligationStatus,
  { label: string; className: string }
> = {
  pending: {
    label: 'Pending',
    className: 'border-border bg-muted text-muted-foreground',
  },
  partial: {
    label: 'Partial',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  received: {
    label: 'Received',
    className: 'border-success/30 bg-success/10 text-success',
  },
  disputed: {
    label: 'Disputed',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
}

export default function StatusBadge({
  status,
  className = '',
}: {
  status: DisplayObligationStatus
  className?: string
}) {
  const { label, className: tone } = STATUS_STYLES[status] ?? STATUS_STYLES.pending
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}${className ? ` ${className}` : ''}`}
    >
      {label}
    </span>
  )
}
