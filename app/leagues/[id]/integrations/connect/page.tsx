import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { ArrowLeft, Plug } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `Connect a fantasy platform — ${ctx.name} | The Commissioner` : 'League not found',
  }
}

export default async function PlatformPickerPage({
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

  // Only commissioner can connect integrations
  if (!ctx.isCommissioner) {
    return (
      <div className="space-y-8">
        {/* Back link */}
        <Link
          href={`/leagues/${id}/integrations`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All integrations
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Plug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Connect a fantasy platform
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Only the commissioner can connect integrations.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            You must be the commissioner of {ctx.name} to connect a fantasy platform.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href={`/leagues/${id}/integrations`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All integrations
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Plug className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Connect a fantasy platform
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a platform to connect your league.
          </p>
        </div>
      </div>

      {/* Platform cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Sleeper card */}
        <Link
          href={`/leagues/${id}/integrations/sleeper`}
          className="block rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ring/60 hover:bg-accent/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Plug className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">
                  Sleeper
                </h3>
                <p className="truncate text-sm text-muted-foreground">
                  Connect your Sleeper league
                </p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Pull rosters, members, and settings from your Sleeper league.
          </p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-primary">
            Connect
            <ArrowLeft className="ml-1.5 h-4 w-4 rotate-180" />
          </span>
        </Link>

        {/* ESPN card */}
        <Link
          href={`/leagues/${id}/integrations/espn`}
          className="block rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ring/60 hover:bg-accent/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Plug className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">
                  ESPN
                </h3>
                <p className="truncate text-sm text-muted-foreground">
                  Connect your ESPN league
                </p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Connect via public league ID or commissioner cookies.
          </p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-primary">
            Connect
            <ArrowLeft className="ml-1.5 h-4 w-4 rotate-180" />
          </span>
        </Link>
      </div>
    </div>
  )
}