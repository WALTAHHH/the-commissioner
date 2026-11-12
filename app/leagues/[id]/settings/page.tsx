import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { prettifyLabel, formatDate } from '@/src/lib/display'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} settings — The Commissioner` : 'League not found',
  }
}

export default async function LeagueSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold leading-tight text-black dark:text-zinc-50 sm:text-3xl">
          League settings
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Read‑only for now — editing lands in a later phase.
        </p>
      </div>

      <dl className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            League name
          </dt>
          <dd className="text-lg text-black dark:text-zinc-50">{ctx.name}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Sport
          </dt>
          <dd className="text-lg text-black dark:text-zinc-50">
            {prettifyLabel(ctx.sport)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Format
          </dt>
          <dd className="text-lg text-black dark:text-zinc-50">
            {prettifyLabel(ctx.format)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            URL slug
          </dt>
          <dd className="text-lg font-mono text-black dark:text-zinc-50">
            {ctx.slug}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Commissioner
          </dt>
          <dd className="text-lg text-black dark:text-zinc-50">
            {ctx.commissionerEmail ?? 'Unknown'}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Created
          </dt>
          <dd className="text-lg text-black dark:text-zinc-50">
            {formatDate(ctx.createdAt)}
          </dd>
        </div>
      </dl>

      <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
          Settings are read‑only in this phase
        </p>
        <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
          These fields cannot be edited yet. League renaming, sport/format
          changes, and commissioner hand‑off will arrive in a future release.
        </p>
      </div>
    </div>
  )
}