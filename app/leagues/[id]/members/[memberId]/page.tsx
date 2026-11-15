import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, listDirectoryMembers } from '@/src/lib/dashboard'
import { displayName, formatDate, prettifyLabel } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import { buildTeamMatching } from '@/src/lib/integrations/team-matching'
import RoleBadge from '@/src/components/role-badge'
import PendingBadge, { IntendedRoleSuffix } from '../pending-badge'
import { ArrowLeft, Plug, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Member profile — page shell + membership header (t_1e44c664).
 *
 * Header only: display name, team name, league role badge, platform role
 * (when the league's integration snapshot makes one explicit), and joined
 * date. The record sections (obligations, votes, awards, activity) are added
 * by their own cards; this shell is deliberately just the identity block so
 * those land as independent sections below it.
 *
 * Visibility: any active member of the league may open a profile
 * (permission model `membership | member | view`). Access is gated by
 * `loadLeagueContext` exactly like the directory/rules/finances pages — a
 * stranger gets a 404, so profiles never leak across leagues. A commissioner
 * additionally sees the account email and any reserved-slot contact/notes
 * ("full view"); everyone else sees the public identity block only.
 *
 * Team name / platform role come from the stored integration sync snapshot via
 * `buildTeamMatching` — read-only, no live API call — and degrade to the
 * member's own `team_name` (or nothing) when no integration is connected.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>
}) {
  const { id, memberId } = await params
  if (!isUuid(id) || !isUuid(memberId)) return {}

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  if (!ctx) return {}

  const members = await listDirectoryMembers(id)
  const member = members.find((m) => m.id === memberId)
  return {
    title: member
      ? `${displayName(member)} — ${ctx.name} — The Commissioner`
      : `${ctx.name} members — The Commissioner`,
  }
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>
}) {
  const { id, memberId } = await params
  if (!isUuid(id) || !isUuid(memberId)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  // Membership gate: null ctx = league missing OR not visible to this viewer.
  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  // The directory reader already carries every field the header needs and is
  // scoped to this league; a member id from another league simply is not here.
  const members = await listDirectoryMembers(id)
  const member = members.find((m) => m.id === memberId)
  if (!member) notFound()

  // Platform role + matched team name from the last sync snapshot (read-only).
  // No active integration / snapshot → both stay null and we fall back to the
  // member's own stored team_name.
  const matching = await buildTeamMatching(id, members)
  const match =
    matching.results.find((r) => r.member?.id === memberId && r.team !== null) ?? null
  const platformRole = match?.team?.platformRole ?? null
  const teamName = match?.team?.teamName ?? member.teamName

  const pending = member.isPlaceholder === true
  const isCommissioner = ctx.isCommissioner

  return (
    <div className="space-y-8">
      {/* Back to directory */}
      <Link
        href={`/leagues/${id}/members`}
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to member directory
      </Link>

      {/* Membership header */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {displayName(member)}
            </h1>

            {/* Role badge · platform role · intended role (slots) */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {pending ? (
                <>
                  <PendingBadge />
                  <IntendedRoleSuffix role={member.role} />
                </>
              ) : (
                <RoleBadge role={member.role} />
              )}
              {platformRole && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                  <Plug className="h-3 w-3" aria-hidden="true" />
                  {prettifyLabel(platformRole)} on platform
                </span>
              )}
            </div>

            {/* Team name (matched integration team, else the stored team_name) */}
            {teamName && (
              <p className="mt-3 text-sm font-medium text-foreground">{teamName}</p>
            )}

            {/* Joined / added date */}
            <p className="mt-2 text-xs text-muted-foreground">
              {pending ? 'Added to roster' : 'Joined'} {formatDate(member.joinedAt)}
            </p>

            {/* Commissioner-only: account email and reserved-slot details */}
            {isCommissioner && (
              <>
                {member.email && (
                  <p className="mt-1 text-xs text-muted-foreground">{member.email}</p>
                )}
                {pending && member.placeholderEmail ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reserved for {member.placeholderEmail}
                  </p>
                ) : null}
                {pending && member.placeholderNotes ? (
                  <p className="mt-1 text-xs text-muted-foreground/80 italic">
                    {member.placeholderNotes}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Back link */}
      <div className="border-t border-border pt-6">
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
