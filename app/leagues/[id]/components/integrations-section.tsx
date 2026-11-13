import { formatDate } from '@/src/lib/display'
import { ExternalLink } from 'lucide-react'
import type { SleeperDisplayData } from '@/src/lib/integrations/sleeper/mapping'

/**
 * "Synced from Sleeper" card for the league dashboard (Sleeper-3).
 *
 * Renders only when a Sleeper connection is active AND a successful sync
 * snapshot exists — data comes from `integration_sync_log.raw_snapshot`, no
 * live Sleeper API call on this path. When absent, the parent renders the
 * regular integrations placeholder instead (additive section, spec-allowed).
 */
export default function SleeperSyncedCard({ data }: { data: SleeperDisplayData }) {
  const { summary } = data

  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <ExternalLink className="h-5 w-5 text-muted-foreground" />
          Sleeper
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            <span
              className="h-1.5 w-1.5 rounded-full bg-success"
              aria-hidden="true"
            />
            Synced from Sleeper
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary.lastSyncedAt ? `Last synced ${formatDate(summary.lastSyncedAt)}` : 'Never synced'}
        </p>
      </div>

      <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">League on Sleeper</dt>
          <dd className="mt-1 text-base font-medium text-foreground">{summary.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Scoring format</dt>
          <dd className="mt-1 text-base font-medium text-foreground">{summary.scoringFormat}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Teams</dt>
          <dd className="mt-1 text-base font-medium text-foreground">{summary.teamCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Status / season</dt>
          <dd className="mt-1 text-base font-medium text-foreground">
            {summary.leagueStatus} · {summary.season}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-xs text-muted-foreground">
        League ID on Sleeper: <span className="font-mono">{summary.externalLeagueId}</span>
      </p>
    </div>
  )
}
