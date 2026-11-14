import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, listActiveMembers, resolveSeason } from '@/src/lib/dashboard'
import { memberDisplayName } from '@/src/lib/history'
import { isUuid } from '@/src/lib/invitations'
import SeasonRecordForm from '../season-record-form'

export const dynamic = 'force-dynamic'

/**
 * Add a season record (champion / runner-up / notes). Commissioner-only:
 * a member sent here is bounced back to the history hub, and
 * `createSeasonRecord` re-checks authorization server-side regardless.
 * Defaults the season year to the league's resolved current season.
 */
export default async function NewSeasonRecordPage({
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
  if (!ctx) notFound()
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/history`)

  const [members, season] = await Promise.all([
    listActiveMembers(id),
    resolveSeason(id),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Add season record
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · champions and runners-up, season by season
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <SeasonRecordForm
          leagueId={id}
          members={members.map((m) => ({ id: m.id, label: memberDisplayName(m) }))}
          initial={{ seasonYear: season.seasonYear }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Awards and recaps can be added from a season&apos;s page once it exists.{' '}
        <Link href={`/leagues/${id}/history`} className="text-primary underline underline-offset-2">
          Back to history
        </Link>
      </p>
    </div>
  )
}
