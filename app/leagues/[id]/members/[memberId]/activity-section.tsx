import Link from 'next/link'
import {
  Activity,
  BookOpen,
  CircleDollarSign,
  Gavel,
  MailPlus,
  Megaphone,
  Pencil,
  Plug,
  Receipt,
  RefreshCw,
  Scale,
  ScrollText,
  Settings,
  Trash,
  Trophy,
  UserMinus,
  UserPlus,
  Vote,
} from 'lucide-react'
import { formatDate, formatRelativeTime, pluralizeCount } from '@/src/lib/display'
import type { MemberActivityEventView } from '@/src/lib/member-activity'

/**
 * Member profile → Activity (t_ee39787e).
 *
 * A self-contained server component: the page reads `loadMemberActivity` and
 * hands the view down; this component renders it (including its own empty
 * state) and never fetches. Zero client JS — the profile is a record you read,
 * not a console you operate.
 *
 * The strip is the newest slice of the league audit trail touching this
 * member: events they performed plus events recorded about them (obligations,
 * removals). Descriptions are authored by `recordActivity()` at write time, so
 * there is no second source of truth to keep in sync here.
 */
export default function MemberActivitySection({
  leagueId,
  memberName,
  events,
}: {
  leagueId: string
  /** Used in copy only ("Nothing recorded for Reyes yet."). */
  memberName: string
  events: MemberActivityEventView[]
}) {
  const now = new Date()

  return (
    <section id="activity" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="text-muted-foreground" aria-hidden="true">
            <Activity className="h-5 w-5" />
          </span>
          Activity
        </h2>
        <span className="text-xs text-muted-foreground">
          {events.length > 0 ? pluralizeCount(events.length, 'event') : '—'}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          <span className="text-muted-foreground/70" aria-hidden="true">
            <Activity className="h-5 w-5" />
          </span>
          Nothing recorded for {memberName} yet.
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} now={now} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Showing the newest activity for this member.{' '}
            <Link
              href={`/leagues/${leagueId}/activity`}
              className="font-medium text-foreground hover:underline"
            >
              See the full league activity feed
            </Link>
            .
          </p>
        </>
      )}
    </section>
  )
}

const EVENT_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  member_joined: { icon: <UserPlus className="h-5 w-5" />, className: 'text-success' },
  member_removed: { icon: <UserMinus className="h-5 w-5" />, className: 'text-destructive' },
  league_member_joined: { icon: <UserPlus className="h-5 w-5" />, className: 'text-success' },
  member_placeholder_created: { icon: <UserPlus className="h-5 w-5" />, className: 'text-primary' },
  member_placeholder_claimed: { icon: <UserPlus className="h-5 w-5" />, className: 'text-success' },
  member_placeholder_merged: { icon: <UserPlus className="h-5 w-5" />, className: 'text-muted-foreground' },
  rule_created: { icon: <BookOpen className="h-5 w-5" />, className: 'text-primary' },
  rule_updated: { icon: <Pencil className="h-5 w-5" />, className: 'text-primary' },
  rule_deleted: { icon: <Trash className="h-5 w-5" />, className: 'text-destructive' },
  obligation_created: { icon: <Receipt className="h-5 w-5" />, className: 'text-warning' },
  payment_recorded: { icon: <CircleDollarSign className="h-5 w-5" />, className: 'text-success' },
  prize_awarded: { icon: <Trophy className="h-5 w-5" />, className: 'text-success' },
  invitation_created: { icon: <MailPlus className="h-5 w-5" />, className: 'text-primary' },
  league_created: { icon: <Trophy className="h-5 w-5" />, className: 'text-primary' },
  league_settings_changed: { icon: <Settings className="h-5 w-5" />, className: 'text-muted-foreground' },
  integration_connected: { icon: <Plug className="h-5 w-5" />, className: 'text-success' },
  integration_synced: { icon: <RefreshCw className="h-5 w-5" />, className: 'text-muted-foreground' },
  announcement_created: { icon: <Megaphone className="h-5 w-5" />, className: 'text-primary' },
  vote_cast: { icon: <Vote className="h-5 w-5" />, className: 'text-primary' },
  poll_created: { icon: <Vote className="h-5 w-5" />, className: 'text-primary' },
  poll_closed: { icon: <Vote className="h-5 w-5" />, className: 'text-muted-foreground' },
  dispute_raised: { icon: <Scale className="h-5 w-5" />, className: 'text-warning' },
  dispute_resolved: { icon: <Gavel className="h-5 w-5" />, className: 'text-success' },
  decision_recorded: { icon: <Gavel className="h-5 w-5" />, className: 'text-primary' },
  award_created: { icon: <ScrollText className="h-5 w-5" />, className: 'text-warning' },
}

const FALLBACK_ICON = {
  icon: <Activity className="h-5 w-5" />,
  className: 'text-muted-foreground',
}

function ActivityRow({
  event,
  now,
}: {
  event: MemberActivityEventView
  now: Date
}) {
  const { icon, className } = EVENT_ICONS[event.eventType] ?? FALLBACK_ICON
  const createdAt = new Date(event.createdAt)

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted ${className}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="break-words text-base font-medium text-foreground">{event.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {event.byMember ? (
            'by this member'
          ) : (
            <>by {event.actorName}</>
          )}{' '}
          ·{' '}
          <time dateTime={event.createdAt} title={formatDate(createdAt)}>
            {formatRelativeTime(createdAt, now)}
          </time>
        </p>
      </div>
    </li>
  )
}
