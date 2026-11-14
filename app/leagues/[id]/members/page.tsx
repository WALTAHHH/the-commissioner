import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, listActiveMembers } from '@/src/lib/dashboard'
import { displayName, prettifyLabel, formatDate, pluralizeCount } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import RemoveMemberButton from './remove-member-button'
import InviteMemberButton from '../invite-member-button'
import RoleBadge from '@/src/components/role-badge'
import SleeperUnmatchedTeams from '../components/sleeper-unmatched-teams'
import { getSleeperDisplayData } from '@/src/lib/integrations/sleeper/mapping'
import { Users, UserPlus, ArrowLeft, Plug } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} members — The Commissioner` : 'League not found',
  }
}

export default async function LeagueMembersPage({
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

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const members = await listActiveMembers(id)

  // Best-effort Sleeper overlay: maps synced roster owners onto these members
  // by display name. null when no Sleeper connection/snapshot exists, in which
  // case the page renders exactly as before (graceful degradation).
  const sleeper = await getSleeperDisplayData(
    id,
    members.map((m) => ({ id: m.id, displayName: displayName(m) })),
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Member directory
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {pluralizeCount(members.length, 'active member')}
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Invite member
            </Link>
          )}
        </div>
      </div>

      {/* Sleeper overlay banner — only when synced data was read */}
      {sleeper && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            <Plug className="h-3 w-3" aria-hidden="true" />
            Synced from Sleeper
          </span>
          <span>
            {sleeper.summary.name} · {sleeper.summary.teamCount} teams ·{' '}
            {sleeper.summary.lastSyncedAt
              ? `synced ${formatDate(sleeper.summary.lastSyncedAt)}`
              : 'never synced'}
          </span>
          {sleeper.mappingAmbiguous && (
            <span className="text-xs">
              Some Sleeper teams could not be matched one-to-one to a member —
              listed below.
            </span>
          )}
        </div>
      )}

      {/* Invite box for commissioner */}
      {ctx.isCommissioner && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 dark:border-primary/30 dark:bg-primary/20">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-primary dark:text-primary/90">
            <UserPlus className="h-5 w-5" />
            Invite new members
          </h3>
          <p className="mb-4 text-sm text-primary/80 dark:text-primary/70">
            Create a shareable invite link (7‑day default, unlimited uses)
          </p>
          <InviteMemberButton leagueId={id} />
        </div>
      )}

      {/* Members list */}
      {members.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            No members yet
          </h3>
          <p className="mt-2 text-muted-foreground">
            Invite members to join this league.
          </p>
          {ctx.isCommissioner && (
            <div className="mt-6">
              <InviteMemberButton leagueId={id} />
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {members.map((m) => {
            const sleeperMatch = sleeper?.matchByMemberId.get(m.id) ?? null
            return (
              <li
                key={m.id}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Users className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-foreground">
                        {displayName(m)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RoleBadge role={m.role} />
                        <span className="text-xs text-muted-foreground">
                          Joined {formatDate(m.joinedAt)}
                        </span>
                        {m.teamName && (
                          <span className="text-xs text-muted-foreground">
                            · {m.teamName}
                          </span>
                        )}
                      </div>
                      {/* Sleeper overlay — absent rows render nothing extra */}
                      {sleeperMatch && (
                        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            <Plug
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {sleeperMatch.teamName}
                            <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                              Sleeper
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {sleeperMatch.displayName} on Sleeper
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  {ctx.isCommissioner && m.role !== 'commissioner' && (
                    <div className="mt-4 sm:mt-0">
                      <RemoveMemberButton
                        leagueId={id}
                        memberId={m.id}
                        memberName={displayName(m)}
                      />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Sleeper teams with no confident member match (never hidden) */}
      {sleeper && <SleeperUnmatchedTeams teams={sleeper.unmatchedTeams} />}

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
