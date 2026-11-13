import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { formatDate } from '@/src/lib/display'
import {
  listLeagueConnections,
  fetchSleeperSnapshot,
  type IntegrationConnectionView,
} from '@/src/lib/integrations/connections'
import { Plug, ArrowRight, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} integrations — The Commissioner` : 'League not found',
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  sleeper: 'Sleeper',
}

/** Where a connection card links for management; null for unsupported providers. */
function manageHref(leagueId: string, provider: string): string | null {
  return provider === 'sleeper' ? `/leagues/${leagueId}/integrations/sleeper` : null
}

function lastSyncedLabel(connection: IntegrationConnectionView): string {
  return connection.lastSyncedAt ? formatDate(connection.lastSyncedAt) : 'Never'
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        active
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-border bg-muted text-muted-foreground'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-muted-foreground/60'}`}
        aria-hidden="true"
      />
      {active ? 'Connected' : 'Disconnected'}
    </span>
  )
}

/**
 * Integrations hub (Sleeper-2): one card per connected external platform.
 *
 * The connection table only stores the external league ID, so league names
 * come from a live Sleeper fetch per connection — failures degrade to the
 * raw ID rather than breaking the page. Non-commissioners see the cards but
 * get no connect CTA; the manage page they land on is read-only for them.
 */
export default async function LeagueIntegrationsPage({
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

  const connections = await listLeagueConnections(id)

  // External league names are not stored; enrich each Sleeper connection
  // live, in parallel, best-effort.
  const snapshots = await Promise.all(
    connections.map((connection) =>
      connection.provider === 'sleeper'
        ? fetchSleeperSnapshot(connection.externalLeagueId)
        : Promise.resolve(null),
    ),
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
            Integrations — connect The Commissioner to your league on other
            platforms
          </p>
        </div>
      </div>

      {/* Body */}
      {connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Plug className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            No integrations connected yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your Sleeper league to pull rosters, members and settings
            into The Commissioner.
          </p>
          {ctx.isCommissioner ? (
            <Link
              href={`/leagues/${id}/integrations/sleeper`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Connect Sleeper
            </Link>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              Only the commissioner can connect integrations.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {connections.map((connection, index) => {
            const snapshot = snapshots[index]
            const externalName =
              snapshot && snapshot.ok
                ? snapshot.snapshot.name
                : `League ${connection.externalLeagueId}`
            const href = manageHref(id, connection.provider)
            const providerLabel =
              PROVIDER_LABELS[connection.provider] ?? connection.provider

            const card = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <Plug className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-foreground">
                        {providerLabel}
                      </h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {externalName}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                      League ID
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-foreground">
                      {connection.externalLeagueId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                      Last synced
                    </dt>
                    <dd className="mt-1 text-foreground">{lastSyncedLabel(connection)}</dd>
                  </div>
                </dl>

                {href && (
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-primary">
                    {ctx.isCommissioner ? 'Manage' : 'View'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </span>
                )}
              </>
            )

            return href ? (
              <Link
                key={connection.id}
                href={href}
                className="block rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ring/60 hover:bg-accent/40"
              >
                {card}
              </Link>
            ) : (
              <div
                key={connection.id}
                className="rounded-2xl border border-border bg-card p-6"
              >
                {card}
              </div>
            )
          })}
        </div>
      )}

      {!ctx.isCommissioner && connections.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Read-only — only the commissioner can connect, sync or disconnect
          integrations.
        </p>
      )}
    </div>
  )
}
