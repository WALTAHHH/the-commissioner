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
import { Users, Trophy, Calendar, Zap, UserCog, Settings } from 'lucide-react'
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
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <UserCog className="mr-2 h-4 w-4" />
            Commissioner
          </span>
        )}
      </div>

      {/* Stats / overview cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
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
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            View all →
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <Calendar className="h-6 w-6 text-success" />
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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <Zap className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quick actions</p>
              <p className="mt-1 text-sm text-foreground">
                Invite, manage, settings
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/leagues/${id}/members`}
              className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-center text-sm font-medium text-foreground hover:border-ring/50"
            >
              Members
            </Link>
            <Link
              href={`/leagues/${id}/settings`}
              className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-center text-sm font-medium text-foreground hover:border-ring/50"
            >
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-foreground">
          <Zap className="h-5 w-5" />
          League management
        </h2>
        <div className="space-y-6">
          {isCommissioner && (
            <div>
              <h3 className="mb-2 text-lg font-medium text-foreground">
                Invite a member
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Create a shareable invite link (7‑day default, unlimited uses)
              </p>
              <InviteMemberButton leagueId={id} />
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/leagues/${id}/members`}
              className="inline-flex items-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Users className="mr-2 h-5 w-5" />
              View all members
            </Link>
            <Link
              href={`/leagues/${id}/settings`}
              className="inline-flex items-center rounded-lg border border-input bg-transparent px-5 py-3 text-base font-medium text-foreground hover:border-ring/50"
            >
              <Settings className="mr-2 h-5 w-5" />
              League settings
            </Link>
          </div>
        </div>
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
                          {displayName(member)}
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
                      className="text-sm font-medium text-primary hover:text-primary/80"
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