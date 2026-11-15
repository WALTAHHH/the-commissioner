import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  loadLeagueContext,
  countActiveMembers,
  listActiveMembers,
  resolveSeason,
} from '@/src/lib/dashboard'
import { displayName, prettifyLabel, formatDate, pluralizeCount } from '@/src/lib/display'
import {
  MEMBER_PREVIEW_LIMIT,
  type SeasonSource,
} from '@/src/lib/dashboard'
import InviteMemberButton from './invite-member-button'
import RoleBadge from '@/src/components/role-badge'
import {
  Users,
  Calendar,
  Zap,
  UserCog,
  UserPlus,
  Megaphone,
  Scale,
  BadgeCheck,
  BookOpen,
  Wallet,
} from 'lucide-react'
import SleeperSyncedCard from './components/integrations-section'
import { getSleeperDisplayData } from '@/src/lib/integrations/sleeper/mapping'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} — The Commissioner` : 'League not found',
  }
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) {
    redirect('/login')
  }

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const [memberCount, members, season] = await Promise.all([
    countActiveMembers(id),
    listActiveMembers(id, MEMBER_PREVIEW_LIMIT),
    resolveSeason(id),
  ])

  const seasonLabel = (src: SeasonSource, year: number) => {
    if (src === 'current') return `Season ${year}` // row flagged is_current
    if (src === 'latest') return `Season ${year} (most recent)`
    return `Season ${year} (no season recorded yet)`
  }

  const isCommissioner = ctx.isCommissioner
  // Optional/additive: null renders the plain placeholder (graceful degrade).
  // Dashboard only shows league-level summary; member matching runs on the
  // members page with the full roster, so no match list here.
  const sleeper = await getSleeperDisplayData(id)

  // The six commissioner quick actions (see t_1e1fa9a6). Each points at an
  // existing route; "Record payment" and "View obligations" both open the
  // finances obligations ledger because recording a payment happens on a
  // specific obligation row there. Management intents are commissioner-only
  // so members never hit a create page that just redirects them back.
  type QuickAction = {
    label: string
    description: string
    href: string
    icon: React.ReactNode
    commissionerOnly: boolean
  }
  const quickActions: QuickAction[] = [
    {
      label: 'Invite a member',
      description: 'Share a link to join the league',
      href: `/leagues/${id}/members`,
      icon: <UserPlus className="h-5 w-5" />,
      commissionerOnly: true,
    },
    {
      label: 'New announcement',
      description: 'Broadcast news to the league',
      href: `/leagues/${id}/announcements/new`,
      icon: <Megaphone className="h-5 w-5" />,
      commissionerOnly: true,
    },
    {
      label: 'New poll',
      description: 'Put a question to a vote',
      href: `/leagues/${id}/governance/polls/new`,
      icon: <Scale className="h-5 w-5" />,
      commissionerOnly: true,
    },
    {
      label: 'Record payment',
      description: "Log a member's dues payment",
      href: `/leagues/${id}/finances`,
      icon: <BadgeCheck className="h-5 w-5" />,
      commissionerOnly: true,
    },
    {
      label: 'Edit rules',
      description: 'Update the league rulebook',
      href: `/leagues/${id}/rules`,
      icon: <BookOpen className="h-5 w-5" />,
      commissionerOnly: true,
    },
    {
      label: 'View obligations',
      description: 'See who owes what',
      href: `/leagues/${id}/finances`,
      icon: <Wallet className="h-5 w-5" />,
      commissionerOnly: false,
    },
  ]
  const visibleActions = quickActions.filter(
    (action) => isCommissioner || !action.commissionerOnly,
  )

  return (
    <div className="space-y-8">
      {/* League header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {prettifyLabel(ctx.sport)} · {prettifyLabel(ctx.format)}
          </p>
        </div>
        {isCommissioner && (
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary dark:border-primary/30 dark:bg-primary/20 dark:text-primary/90">
            <UserCog className="mr-2 h-4 w-4" />
            Commissioner
          </span>
        )}
      </div>

      {/* Stats / overview cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
              <Users className="h-6 w-6 text-primary dark:text-primary/80" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active members</p>
              <p className="mt-1 text-3xl font-bold text-foreground">
                {memberCount}
              </p>
            </div>
          </div>
          <Link
            href={`/leagues/${id}/members`}
            className="text-sm font-medium text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/60"
          >
            View all →
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 dark:bg-success/20">
              <Calendar className="h-6 w-6 text-success dark:text-success/80" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Season</p>
              <p className="mt-1 text-3xl font-bold text-foreground">
                {season.seasonYear}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {seasonLabel(season.source, season.seasonYear)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 dark:bg-accent/20">
              <Zap className="h-6 w-6 text-accent dark:text-accent/80" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your role</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {isCommissioner ? 'Commissioner' : 'Member'}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {isCommissioner
              ? 'You can invite, announce, poll, record payments, and edit the rulebook.'
              : 'You can read the rulebook and announcements, and view your own obligations.'}
          </p>
        </div>
      </div>

      {/* Quick actions — the six commissioner shortcuts. */}
      <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-foreground">
          <Zap className="h-5 w-5" />
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-ring/50 hover:bg-accent/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground group-hover:text-primary">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
        {isCommissioner && (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-2 text-lg font-medium text-foreground">
              Create an invite link
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Generate a shareable link (7‑day default, unlimited uses). The
              &ldquo;Invite a member&rdquo; shortcut above opens the roster.
            </p>
            <InviteMemberButton leagueId={id} />
          </div>
        )}
      </div>

      {/* Member preview */}
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground">
            {pluralizeCount(memberCount, 'member')}
          </p>
        </div>
        {members.length === 0 ? (
          <p className="text-muted-foreground">No active members yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li key={member.id} className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Users className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          <Link
                            href={`/leagues/${id}/members/${member.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {displayName(member)}
                          </Link>
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <RoleBadge role={member.role} />
                          <span className="text-xs text-muted-foreground">
                            Joined {formatDate(member.joinedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/leagues/${id}/members`}
                      className="text-sm font-medium text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/60"
                    >
                      View →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {memberCount > members.length && (
              <div className="mt-6 text-center">
                <Link
                  href={`/leagues/${id}/members`}
                  className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  View all {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Integrations — Sleeper sync card only when connected + synced */}
      {sleeper ? (
        <SleeperSyncedCard data={sleeper} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Integrations
          </h2>
          <p className="text-muted-foreground">
            No integrations connected — imports from third‑party fantasy platforms
            will land in a later phase.
          </p>
        </div>
      )}
    </div>
  )
}