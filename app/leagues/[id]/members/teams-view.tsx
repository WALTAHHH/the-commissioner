import type { TeamMatchResult, TeamMatchingOutcome } from '@/src/lib/integrations/team-matching'
import { formatDate, prettifyLabel } from '@/src/lib/display'
import RoleBadge from '@/src/components/role-badge'
import { AlertTriangle, ClipboardList, Plug, Users } from 'lucide-react'

/**
 * Teams view for the member directory (t_84a46c7f).
 *
 * One card per team/member pair from `buildTeamMatching` — purely a read of
 * the last sync snapshot plus our own rows. Read-only by spec: no actions,
 * no editing affordances here.
 *
 * Badge language (spec §2):
 *  - matched            → no status badge (a clean card is the happy path)
 *  - unmatched_team     → ⚠ "Team not claimed"  (exists on the platform, no
 *                         member in our DB could be tied to it)
 *  - unmatched_member   → 📋 "No team assigned"  (a member with no team in
 *                         the integration snapshot)
 */

function providerLabel(provider: string | null): string {
  if (!provider) return 'integration'
  return provider === 'espn' ? 'ESPN' : prettifyLabel(provider)
}

function displayNameForCard(result: TeamMatchResult): string {
  // Spec hierarchy: integration team name → our member's team_name → member
  // display name (cards without a team fall through to the member fields).
  return (
    result.team?.teamName ??
    result.member?.teamName ??
    result.member?.displayName ??
    'Unnamed team'
  )
}

function MatchStatusBadge({ status }: { status: TeamMatchResult['matchStatus'] }) {
  if (status === 'matched') return null
  if (status === 'unmatched_team') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Team not claimed
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <ClipboardList className="h-3 w-3" aria-hidden="true" />
      No team assigned
    </span>
  )
}

function TeamCard({ result, provider }: { result: TeamMatchResult; provider: string | null }) {
  const { team, member } = result
  const platform = providerLabel(provider)
  const coOwnerNames =
    team?.coOwners
      .map((o) => o.displayName ?? o.externalId)
      .filter((n): n is string => typeof n === 'string' && n !== '') ?? []

  return (
    <li
      className={
        result.matchStatus === 'unmatched_team'
          ? 'rounded-xl border border-warning/30 bg-card p-5'
          : 'rounded-xl border border-border bg-card p-5'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {displayNameForCard(result)}
        </h3>
        <MatchStatusBadge status={result.matchStatus} />
      </div>

      {/* Primary owner */}
      {member ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {member.displayName}
            </p>
            {member.email && (
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            )}
          </div>
        </div>
      ) : team ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {team.ownerDisplayName ?? 'Unknown owner'}
          </span>
          <span className="ml-1 text-xs">owns this team on {platform} but is not in our directory</span>
        </p>
      ) : null}

      {/* Co-owners (Sleeper roster co_owners / ESPN secondary owners) */}
      {coOwnerNames.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Co-owners:</span>{' '}
          {coOwnerNames.join(', ')}
        </p>
      )}

      {/* Roles */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {member && <RoleBadge role={member.role} />}
        {team?.platformRole && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            title={`Role on ${platform} (from the last sync)`}
          >
            <Plug className="h-3 w-3" aria-hidden="true" />
            {platform}: {team.platformRole}
          </span>
        )}
      </div>

      {result.matchStatus === 'unmatched_member' && (
        <p className="mt-3 text-xs text-muted-foreground">
          No team found for this member in the {platform} snapshot.
        </p>
      )}
    </li>
  )
}

export default function TeamsView({ matching }: { matching: TeamMatchingOutcome }) {
  const { results, provider, snapshotLoaded } = matching

  const matchedCount = results.filter((r) => r.matchStatus === 'matched').length
  const unclaimedTeams = results.filter((r) => r.matchStatus === 'unmatched_team').length
  const membersWithoutTeam = results.filter((r) => r.matchStatus === 'unmatched_member').length

  return (
    <div className="space-y-4">
      {!snapshotLoaded && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {provider
            ? `No ${providerLabel(provider)} sync snapshot yet — teams will appear here after the first sync. Members are listed below without team data.`
            : 'No integration connected — every member shows as unassigned. Connect Sleeper or ESPN to see their platform teams.'}
        </div>
      )}

      {results.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-foreground">Nothing to show yet</h3>
          <p className="mt-2 text-muted-foreground">
            No members and no synced teams for this league.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {matchedCount} matched
            {unclaimedTeams > 0 && <> · {unclaimedTeams} team{unclaimedTeams === 1 ? '' : 's'} not claimed</>}
            {membersWithoutTeam > 0 && (
              <> · {membersWithoutTeam} member{membersWithoutTeam === 1 ? '' : 's'} without a team</>
            )}
            {matching.lastSyncedAt && snapshotLoaded && (
              <> · synced {formatDate(matching.lastSyncedAt)}</>
            )}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((result) => (
              <TeamCard
                key={`${result.matchStatus}:${result.team?.externalId ?? ''}:${result.member?.id ?? ''}`}
                result={result}
                provider={provider}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
