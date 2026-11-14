import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { formatDate, prettifyLabel } from '@/src/lib/display'
import {
  getProviderConnection,
  fetchESPNConnectionSnapshot,
} from '@/src/lib/integrations/connections'
import ConnectESPNForm from './connect-espn-form'
import SyncNowButton from '../sleeper/sync-now-button'
import DisconnectButton from '../sleeper/disconnect-button'
import UpdateCookiesButton from './update-cookies-button'
import { ArrowLeft, ExternalLink, Users, Trophy, Calendar, Plug, RefreshCw, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `Connect ESPN — ${ctx.name} | The Commissioner` : 'League not found',
  }
}

/** 'Nov 13, 2026 at 19:05 UTC' — UTC everywhere, like the rest of the app. */
function formatSyncedAt(value: Date): string {
  const time = value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
  return `${formatDate(value)} at ${time} UTC`
}

/**
 * ESPN connection flow (ESPN-2).
 *
 * Two shapes, keyed off the (league_id, provider) connection row — the
 * unique index means there is at most one, so a previously-disconnected
 * league lands back on the form and \"connect\" reactivates the row:
 *  - connected: live league details + Sync now / Disconnect / Update cookies
 *  - not connected: form with league ID, season year, private toggle,
 *    cookie fields (revealed on toggle).
 *
 * Commissioners get the controls; members see the same page read-only.
 * If the ESPN API is unreachable the details card degrades to the raw
 * league ID plus the reason, and Sync/Disconnect stay available — they are
 * exactly what a stale view needs.
 */
export default async function ESPNConnectionPage({
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

  const connection = await getProviderConnection(id, 'espn')
  const isConnected = connection !== null && connection.status === 'active'
  const wasDisconnected = connection !== null && connection.status === 'disconnected'
  const authRequired = connection !== null && connection.status === 'auth_required'

  const snapshot = isConnected || authRequired
    ? await fetchESPNConnectionSnapshot(connection!.id)
    : null

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
            ESPN
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isConnected
              ? `Connected to ${ctx.name}`
              : wasDisconnected
                ? 'Previously disconnected — connect again any time'
                : authRequired
                  ? 'Cookies may have expired — reconnect to update'
                  : 'Link this league to its ESPN counterpart'}
          </p>
        </div>
      </div>

      {isConnected || authRequired ? (
        <div className="space-y-6">
          {/* Details card */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            {snapshot && snapshot.ok ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="text-2xl font-bold text-foreground">
                    {snapshot.snapshot.name}
                  </h2>
                  <a
                    href={`https://fantasy.espn.com/football/league?leagueId=${connection!.externalLeagueId}&seasonId=${connection!.seasonYear ?? snapshot.snapshot.seasonYear}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    Open on ESPN
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {connection!.externalLeagueId}
                </p>

                {/* Private badge */}
                {connection!.hasCookies && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Private league
                  </div>
                )}

                <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <Trophy className="h-3.5 w-3.5" />
                      Teams
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {snapshot.snapshot.teamCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Season
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {snapshot.snapshot.seasonYear}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      Scoring period
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {snapshot.snapshot.scoringPeriodId}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Last synced
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {connection!.lastSyncedAt ? formatSyncedAt(connection!.lastSyncedAt) : 'Not yet synced'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              /* Details unavailable — keep the raw connection visible so
                 Sync/Disconnect can still fix it. */
              <>
                <h2 className="text-2xl font-bold text-foreground">
                  League {connection!.externalLeagueId}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {snapshot && !snapshot.ok ? snapshot.reason : 'Could not load league details.'}{' '}
                  It may have been renamed, moved, or made private — or ESPN
                  may be having a moment. Try Sync now.
                </p>
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  Last synced:{' '}
                  {connection!.lastSyncedAt ? formatSyncedAt(connection!.lastSyncedAt) : 'Not yet synced'}
                </p>
              </>
            )}
          </div>

          {/* Controls */}
          {ctx.isCommissioner ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <SyncNowButton connectionId={connection!.id} />
              <DisconnectButton connectionId={connection!.id} />
              {connection!.hasCookies && (
                <UpdateCookiesButton connectionId={connection!.id} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Read-only — only the commissioner can sync or disconnect this
              integration.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          {ctx.isCommissioner ? (
            <ConnectESPNForm leagueId={id} />
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground">
                Not connected
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                No ESPN league is connected to {ctx.name} yet. Only the
                commissioner can connect one.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}