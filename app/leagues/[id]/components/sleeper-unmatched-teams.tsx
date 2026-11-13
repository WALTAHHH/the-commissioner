import { Plug } from 'lucide-react'
import type { SleeperTeamInfo } from '@/src/lib/integrations/sleeper/mapping'

/**
 * Sleeper teams from the synced roster snapshot that could not be confidently
 * mapped to a league member (no name match, or an ambiguous one).
 *
 * Spec: ambiguous mapping must surface the Sleeper data as an unmatched roster
 * list rather than hiding it. Renders nothing when the list is empty so the
 * members page stays unchanged for leagues without Sleeper data.
 */
export default function SleeperUnmatchedTeams({ teams }: { teams: SleeperTeamInfo[] }) {
  if (teams.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
        <Plug className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Unmatched Sleeper teams
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {teams.length === 1
          ? 'This team is in the synced Sleeper roster but no member was matched to it.'
          : `These ${teams.length} teams are in the synced Sleeper roster but no member was matched to them.`}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <li
            key={t.rosterId}
            className="rounded-lg border border-border bg-muted/40 px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground">{t.teamName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t.ownerDisplayName ?? 'No display name on Sleeper'}
              <span className="ml-1 font-mono text-muted-foreground/70">
                · roster {t.rosterId}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
