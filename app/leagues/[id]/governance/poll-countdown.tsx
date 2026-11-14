'use client'

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'

/**
 * Live countdown to a poll's `closes_at` (Governance-2).
 *
 * The server renders `initialLabel` and this component only starts ticking
 * after mount, so the first client render matches the server HTML exactly
 * (a clock read during render would hydrate-mismatch on every poll).
 *
 * Passing `closes_at` is not a state transition: nothing flips `polls.status`
 * when the window expires (there is no cron), so at zero we say "Voting
 * closed" and let the commissioner close the poll explicitly.
 */
export default function PollCountdown({
  closesAt,
  initialLabel,
  className = '',
}: {
  closesAt: string
  initialLabel: string
  className?: string
}) {
  const [label, setLabel] = useState(initialLabel)

  useEffect(() => {
    const target = new Date(closesAt).getTime()
    if (!Number.isFinite(target)) return

    const tick = () => {
      setLabel(describeRemaining(target - Date.now()))
    }
    tick()
    // Coarse cadence: the smallest unit shown is a minute, so a per-second
    // timer would be pure re-render cost across a list of polls.
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [closesAt])

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground${
        className ? ` ${className}` : ''
      }`}
    >
      <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}

/** '3d 4h left' / '18h 5m left' / '42m left' / 'Voting closed'. */
export function describeRemaining(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return 'Voting closed'
  const totalMinutes = Math.floor(msLeft / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  if (minutes > 0) return `${minutes}m left`
  return 'Less than a minute left'
}

/**
 * Server-side twin of `describeRemaining`, computed against the request clock
 * so the markup this component replaces on hydration is identical.
 */
export function initialCountdownLabel(closesAt: string, now: Date = new Date()): string {
  const target = new Date(closesAt).getTime()
  if (!Number.isFinite(target)) return 'No end date'
  return describeRemaining(target - now.getTime())
}
