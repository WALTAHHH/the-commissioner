import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadLeagueContext, listActiveMembers } from '@/src/lib/dashboard'
import { memberDisplayName, loadSeasonView } from '@/src/lib/history'
import { isUuid } from '@/src/lib/invitations'
import SeasonRecordForm from '../../season-record-form'
import AwardForm from './award-form'
import RecapForm from './recap-form'

export const dynamic = 'force-dynamic'

const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100

/**
 * Edit a season (commissioner-only): correct the record, add awards, edit
 * the recap. Each section submits through its own action in
 * app/actions/history.ts; non-commissioners bounce back to the hub and the
 * actions re-check authorization server-side regardless.
 */
export default async function EditSeasonPage({
  params,
}: {
  params: Promise<{ id: string; year: string }>
}) {
  const { id, year: yearParam } = await params
  if (!isUuid(id)) notFound()

  const seasonYear = Number(yearParam)
  if (!Number.isInteger(seasonYear) || seasonYear < SEASON_YEAR_MIN || seasonYear > SEASON_YEAR_MAX) {
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/history`)

  const [existing, members] = await Promise.all([
    loadSeasonView(id, seasonYear),
    listActiveMembers(id),
  ])

  const memberOptions = members.map((m) => ({ id: m.id, label: memberDisplayName(m) }))
  const record = existing?.record

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/leagues/${id}/history`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to history
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Season {seasonYear}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · {record ? 'update the record, awards and recap' : 'nothing recorded for this season yet — add it below'}
        </p>
      </div>

      {/* Season record */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Champion & runner-up</h2>
        <SeasonRecordForm
          leagueId={id}
          members={memberOptions}
          submitLabel={record ? 'Update season record' : 'Add season record'}
          initial={{
            seasonYear,
            championMemberId: record?.champion_member_id ?? '',
            championTeamName: record?.champion_team_name ?? '',
            runnerUpMemberId: record?.runner_up_member_id ?? '',
            notes: record?.notes ?? '',
          }}
        />
      </section>

      {/* Awards */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Awards</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {existing && existing.awards.length > 0
            ? `${existing.awards.length} award${existing.awards.length === 1 ? '' : 's'} recorded so far — add another below.`
            : 'No awards yet for this season.'}
        </p>
        <AwardForm leagueId={id} seasonYear={seasonYear} members={memberOptions} />
      </section>

      {/* Recap */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Season recap</h2>
        <RecapForm
          leagueId={id}
          seasonYear={seasonYear}
          initialBody={existing?.recap?.body ?? ''}
        />
      </section>
    </div>
  )
}
