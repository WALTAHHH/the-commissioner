import type { DisputeStatus } from '@/src/db/schema/governance'
import { prettifyLabel } from '@/src/lib/display'
import type { PollStatus, PollThreshold, PollType } from '@/src/db/schema/governance'

/**
 * Governance badges (Governance-2).
 *
 * 'expired' is a UI-only poll state: nothing in the schema flips status when
 * `closes_at` passes (there is no cron), so the pages derive it from the
 * clock and render it distinctly. It must never be written back as a status.
 */

const POLL_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  open: {
    label: 'Open',
    className: 'border-success/30 bg-success/10 text-success',
  },
  expired: {
    label: 'Voting closed',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  closed: {
    label: 'Closed',
    className: 'border-border bg-muted text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
}

const DISPUTE_STATUS_STYLES: Record<DisputeStatus, { label: string; className: string }> = {
  open: {
    label: 'Open',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  resolved: {
    label: 'Resolved',
    className: 'border-success/30 bg-success/10 text-success',
  },
}

function Badge({
  tone,
  children,
  className = '',
}: {
  tone: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </span>
  )
}

export function PollStatusBadge({
  status,
  expired = false,
  className,
}: {
  status: PollStatus
  /** Derived by the caller from `closes_at`; only meaningful when open. */
  expired?: boolean
  className?: string
}) {
  const key = status === 'open' && expired ? 'expired' : status
  const { label, className: tone } = POLL_STATUS_STYLES[key] ?? POLL_STATUS_STYLES.open
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}

export function PollTypeBadge({ type, className }: { type: PollType; className?: string }) {
  return (
    <Badge
      tone={
        type === 'binding'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground'
      }
      className={className}
    >
      {type === 'binding' ? 'Binding' : 'Informal'}
    </Badge>
  )
}

export function ThresholdBadge({
  threshold,
  customThreshold,
  className,
}: {
  threshold: PollThreshold
  customThreshold?: number | null
  className?: string
}) {
  // 'custom' with no stored number is a data condition closePoll can never
  // satisfy, so it is labelled honestly rather than as a bare "Custom".
  const label =
    threshold === 'custom' && customThreshold === null
      ? 'Custom (unset)'
      : threshold === 'custom'
        ? `Custom ≥${customThreshold}`
        : prettifyLabel(threshold)
  return (
    <Badge tone="border-border bg-card text-muted-foreground" className={className}>
      {label}
    </Badge>
  )
}

export function DisputeStatusBadge({
  status,
  className,
}: {
  status: DisputeStatus
  className?: string
}) {
  const { label, className: tone } = DISPUTE_STATUS_STYLES[status] ?? DISPUTE_STATUS_STYLES.open
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}

export function OutcomeBadge({
  passed,
  isTie,
  className,
}: {
  passed: boolean
  isTie?: boolean
  className?: string
}) {
  if (isTie) {
    return (
      <Badge tone="border-warning/30 bg-warning/10 text-warning" className={className}>
        No majority (tie)
      </Badge>
    )
  }
  return (
    <Badge
      tone={
        passed
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
      }
      className={className}
    >
      {passed ? 'Threshold met' : 'Threshold not met'}
    </Badge>
  )
}
