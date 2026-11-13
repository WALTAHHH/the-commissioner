import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { listActivityFeed, type ActivityFeedEntry } from '@/src/lib/activity'
import { formatRelativeTime, formatDate } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CircleDollarSign,
  MailPlus,
  Pencil,
  Plug,
  Receipt,
  RefreshCw,
  Settings,
  Trash,
  Trophy,
  UserMinus,
  UserPlus,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * One icon per audit event type (see ACTIVITY_EVENT_TYPES in
 * src/db/schema/activity.ts). Anything unrecognised — a type added later, or
 * a hand-inserted row — falls back to the generic Activity pulse so the feed
 * never drops an entry for want of an icon.
 */
const EVENT_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  member_joined: { icon: <UserPlus className="h-5 w-5" />, className: 'text-success' },
  member_removed: { icon: <UserMinus className="h-5 w-5" />, className: 'text-destructive' },
  rule_created: { icon: <BookOpen className="h-5 w-5" />, className: 'text-primary' },
  rule_updated: { icon: <Pencil className="h-5 w-5" />, className: 'text-primary' },
  rule_deleted: { icon: <Trash className="h-5 w-5" />, className: 'text-destructive' },
  obligation_created: { icon: <Receipt className="h-5 w-5" />, className: 'text-warning' },
  payment_recorded: { icon: <CircleDollarSign className="h-5 w-5" />, className: 'text-success' },
  invitation_created: { icon: <MailPlus className="h-5 w-5" />, className: 'text-primary' },
  league_created: { icon: <Trophy className="h-5 w-5" />, className: 'text-primary' },
  league_settings_changed: { icon: <Settings className="h-5 w-5" />, className: 'text-muted-foreground' },
  integration_connected: { icon: <Plug className="h-5 w-5" />, className: 'text-success' },
  integration_synced: { icon: <RefreshCw className="h-5 w-5" />, className: 'text-muted-foreground' },
}

const FALLBACK_ICON = {
  icon: <Activity className="h-5 w-5" />,
  className: 'text-muted-foreground',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} activity — The Commissioner` : 'League not found',
  }
}

export default async function LeagueActivityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!isUuid(id)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  // Authorisation gate: loadLeagueContext returns null for both "no league"
  // and "league not visible to this viewer", so a stranger gets a 404 — same
  // rule the members/rules/integrations pages apply. The service-role client
  // behind listActivityFeed bypasses RLS; this check is the only gate.
  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const events = await listActivityFeed(id)
  // One clock for the whole page so two entries written seconds apart are
  // described consistently ("3 hours ago" both, not 3 vs 4).
  const now = new Date()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Activity feed — everything that has happened in this league
          </p>
        </div>
      </div>

      {/* Feed */}
      {events.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            No activity yet
          </h3>
          <p className="mt-2 text-muted-foreground">
            Member changes, rule edits, invites and syncs will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {events.map((event) => (
            <ActivityEntry key={event.id} event={event} now={now} />
          ))}
        </ul>
      )}

      {/* Back link */}
      <div className="pt-6 border-t border-border">
        <Link
          href={`/leagues/${id}`}
          className="inline-flex items-center text-sm font-medium text-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to league dashboard
        </Link>
      </div>
    </div>
  )
}

function ActivityEntry({
  event,
  now,
}: {
  event: ActivityFeedEntry
  now: Date
}) {
  const { icon, className } = EVENT_ICONS[event.eventType] ?? FALLBACK_ICON

  return (
    <li className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted ${className}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-medium text-foreground break-words">
            {event.description}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            by {event.actorName} ·{' '}
            <time
              dateTime={event.createdAt.toISOString()}
              title={formatDate(event.createdAt)}
            >
              {formatRelativeTime(event.createdAt, now)}
            </time>
          </p>
        </div>
      </div>
    </li>
  )
}
