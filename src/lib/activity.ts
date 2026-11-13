/**
 * Activity feed utilities — the only sanctioned way to write (and read)
 * `activity_events`.
 *
 * ## Write side
 * Every notable mutation in `app/actions/*` calls `recordActivity()` after it
 * succeeds. It is deliberately best-effort: the audit trail must never break
 * the user-facing action it is reporting on, so failures are logged and
 * swallowed. Two known consequences, both accepted:
 *
 *  1. No distributed transaction is possible over PostgREST (one statement
 *     per HTTPS request), so an action can succeed while its event is lost.
 *     If the trail ever needs exactly-once semantics, the fix is a triggers
 *     or outbox design, not a try/hope here.
 *  2. Until migration 0005 is applied the table does not exist; every insert
 *     logs a PGRST205/404 and changes nothing. Callers still return success.
 *
 * ## Read side
 * `listActivityFeed()` returns the newest events with actor identities
 * resolved (email/full name), because PostgREST cannot reach the auth
 * schema — same GoTrue admin lookup pattern the dashboard uses.
 *
 * ## Security
 * There is no RLS here (the service-role key bypasses it). Authorisation is
 * the caller's job: the page must run `loadLeagueContext` first and only
 * then list events, exactly like every other league page.
 */
import { db } from '@/src/lib/db'
import { fetchIdentities } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import type { ActivityEventType } from '@/src/db/schema/activity'
import type { ActivityEventRow } from '@/src/db/rows'

export type ActivityMetadata = Record<string, unknown>

export type ActivityFeedEntry = {
  id: string
  eventType: string
  description: string
  metadata: ActivityMetadata | null
  createdAt: Date
  /** 'Alice' / email / 'System' — never throws, never blank. */
  actorName: string
}

/** Cap for one feed page; the UI shows the newest slice only. */
export const ACTIVITY_FEED_LIMIT = 100

/**
 * Append one event to the league's audit trail.
 *
 * Never throws and never returns a status — callers must not branch on it.
 * `actorId` may be null for system-generated events (future scheduled syncs);
 * the feed renders those as 'System'.
 */
export async function recordActivity(
  leagueId: string,
  actorId: string | null,
  eventType: ActivityEventType,
  description: string,
  metadata?: ActivityMetadata,
): Promise<void> {
  try {
    const { error } = await db.from('activity_events').insert({
      league_id: leagueId,
      actor_id: actorId,
      event_type: eventType,
      description,
      metadata: metadata ?? null,
    })

    if (error) {
      // 42P01/PGRST205 = table not created yet (migration pending). Loud in
      // the logs, invisible to the user.
      console.error('recordActivity insert error:', error)
    }
  } catch (err) {
    console.error('recordActivity unexpected failure:', err)
  }
}

/**
 * Newest-first activity for one league, with actor names resolved.
 *
 * Assumes the caller has already authorised the viewer against this league
 * (see the module header). A query failure degrades to an empty feed rather
 * than a broken page, matching the dashboard's read posture.
 */
export async function listActivityFeed(
  leagueId: string,
  limit: number = ACTIVITY_FEED_LIMIT,
): Promise<ActivityFeedEntry[]> {
  const { data, error } = await db
    .from('activity_events')
    .select('id, league_id, actor_id, event_type, description, metadata, created_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('listActivityFeed error:', error)
    return []
  }

  const rows = (data ?? []) as unknown as ActivityEventRow[]
  if (rows.length === 0) return []

  const identities = await fetchIdentities(
    rows.map((row) => row.actor_id).filter((id): id is string => id !== null),
  )

  return rows.map((row) => {
    const actor = row.actor_id ? identities.get(row.actor_id) : null
    return {
      id: row.id,
      eventType: row.event_type,
      description: row.description,
      metadata: (row.metadata ?? null) as ActivityMetadata | null,
      createdAt: new Date(row.created_at),
      actorName: actor ? displayName(actor) : 'System',
    }
  })
}
