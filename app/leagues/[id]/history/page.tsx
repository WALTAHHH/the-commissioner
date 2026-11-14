import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import {
  loadHistorySeasons,
  loadMemberNameMap,
  type LeagueSeasonView,
} from '@/src/lib/history'
import MarkdownBody from '@/src/components/markdown-body'
import type { LeagueAwardRow, SeasonRecordRow } from '@/src/db/rows'
import { Trophy, Award, FileText, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * History hub: champions, awards, season recaps, newest season first.
 *
 * Visibility: all league members can view; commissioner can add/edit.
 * Reads go through src/lib/history (membership enforced here via
 * loadLeagueContext), matching the governance hub's page-vs-action
 * layering; writes go through app/actions/history.ts.
 */

/** Name for a league_members id, with graceful degradation for gone members. */
function memberName(
  memberId: string | null,
  names: Record<string, string>,
): string {
  if (!memberId) return ''
  return names[memberId] ?? 'Former member'
}

function championLabel(record: SeasonRecordRow, names: Record<string, string>): string {
  const teamName = record.champion_team_name?.trim()
  if (teamName) return teamName
  const viaMember = memberName(record.champion_member_id, names)
  return viaMember || 'No champion recorded'
}

export default async function LeagueHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  // loadLeagueContext returns null unless the viewer is an active member or
  // the commissioner — so a null ctx is the membership gate.
  if (!ctx) notFound()

  // Name map resolves champion/runner-up/award member ids to display names.
  const [seasons, names] = await Promise.all([
    loadHistorySeasons(id),
    import('@/src/lib/history').then((m) => m.loadMemberNameMap(id)),
  ])
  const view = seasons ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            League history — champions, awards, season summaries
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/history/new`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add season record
          </Link>
        )}
      </div>

      {/* Empty state */}
      {view.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Trophy className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-semibold text-foreground">
            No history yet. Add your first season record.
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}/history/new`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              Add your first season record
            </Link>
          )}
        </div>
      )}

      {/* Season list, most recent first */}
      {view.map((season: LeagueSeasonView) => (
        <div
          key={season.seasonYear}
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              Season {season.seasonYear}
            </h2>
            {ctx.isCommissioner && (
              <Link
                href={`/leagues/${id}/history/${season.seasonYear}/edit`}
                className="inline-flex shrink-0 items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Edit
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Champion & runner-up */}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-4 w-4" />
                Champion
              </h3>
              {season.record ? (
                <div className="space-y-1">
                  <p className="text-lg font-semibold break-words text-foreground">
                    {championLabel(season.record, names)}
                  </p>
                  {season.record.runner_up_member_id && (
                    <p className="text-sm text-muted-foreground">
                      Runner-up: {memberName(season.record.runner_up_member_id, names)}
                    </p>
                  )}
                  {season.record.notes && (
                    <p className="mt-2 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                      {season.record.notes}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No champion recorded for this season.
                </p>
              )}
            </div>

            {/* Awards */}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Award className="h-4 w-4" />
                Awards
              </h3>
              {season.awards.length > 0 ? (
                <ul className="space-y-2">
                  {season.awards.map((award: LeagueAwardRow) => (
                    <li
                      key={award.id}
                      className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium break-words text-foreground">
                        {award.award_name}
                        {award.member_id && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            — {memberName(award.member_id, names)}
                          </span>
                        )}
                      </span>
                      {award.description && (
                        <span className="text-sm break-words text-muted-foreground sm:text-right">
                          {award.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No awards for this season.
                </p>
              )}
            </div>
          </div>

          {/* Recap */}
          {season.recap && (
            <div className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" />
                Season Recap
              </h3>
              <MarkdownBody source={season.recap.body} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
