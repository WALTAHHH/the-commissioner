/**
 * History read helpers (server-only).
 *
 * Same layering as src/lib/governance.ts: pages render from these queries
 * after their own membership check via loadLeagueContext, while the
 * authorize()-gated actions in app/actions/history.ts form the API surface.
 * The authorize() service is still a deny-by-default Phase-1 stub
 * (repo-wide convention), so pages must not depend on it to render.
 */

import { db } from '@/src/lib/db'
import { listActiveMembers, type MemberRow } from '@/src/lib/dashboard'
import type {
  SeasonRecordRow,
  LeagueAwardRow,
  SeasonRecapRow,
} from '@/src/db/rows'

export type LeagueSeasonView = {
  seasonYear: number
  record?: SeasonRecordRow
  awards: LeagueAwardRow[]
  recap?: SeasonRecapRow
}

/**
 * All history for a league, grouped by season year, most recent first.
 * Returns null when any of the three queries fails (caller decides how to
 * degrade); an empty league legitimately resolves to [].
 */
export async function loadHistorySeasons(
  leagueId: string,
): Promise<LeagueSeasonView[] | null> {
  const [recordsRes, awardsRes, recapsRes] = await Promise.all([
    db
      .from('season_records')
      .select('*')
      .eq('league_id', leagueId)
      .order('season_year', { ascending: false }),
    db
      .from('league_awards')
      .select('*')
      .eq('league_id', leagueId)
      .order('season_year', { ascending: false }),
    db
      .from('season_recaps')
      .select('*')
      .eq('league_id', leagueId)
      .order('season_year', { ascending: false }),
  ])

  if (recordsRes.error) {
    console.error('loadHistorySeasons records error:', recordsRes.error)
    return null
  }
  if (awardsRes.error) {
    console.error('loadHistorySeasons awards error:', awardsRes.error)
    return null
  }
  if (recapsRes.error) {
    console.error('loadHistorySeasons recaps error:', recapsRes.error)
    return null
  }

  return groupSeasons(
    (recordsRes.data ?? []) as unknown as SeasonRecordRow[],
    (awardsRes.data ?? []) as unknown as LeagueAwardRow[],
    (recapsRes.data ?? []) as unknown as SeasonRecapRow[],
  )
}

/** Single season, or undefined when that year has no history rows. */
export async function loadSeasonView(
  leagueId: string,
  seasonYear: number,
): Promise<LeagueSeasonView | undefined> {
  const seasons = await loadHistorySeasons(leagueId)
  return seasons?.find((s) => s.seasonYear === seasonYear)
}

/** Merge the three row sets into per-season views, newest year first. */
export function groupSeasons(
  records: SeasonRecordRow[],
  awards: LeagueAwardRow[],
  recaps: SeasonRecapRow[],
): LeagueSeasonView[] {
  const byYear = new Map<number, LeagueSeasonView>()
  const touch = (year: number): LeagueSeasonView => {
    let season = byYear.get(year)
    if (!season) {
      season = { seasonYear: year, awards: [] }
      byYear.set(year, season)
    }
    return season
  }
  for (const r of records) touch(r.season_year).record = r
  for (const a of awards) touch(a.season_year).awards.push(a)
  for (const r of recaps) touch(r.season_year).recap = r
  return Array.from(byYear.values()).sort((a, b) => b.seasonYear - a.seasonYear)
}

/**
 * league_members.id -> display name, for active members of this league.
 * A Record (not a Map) so pages can pass it straight to client components.
 * Ids missing from the map (former members) must render as 'Former member'.
 */
export async function loadMemberNameMap(
  leagueId: string,
): Promise<Record<string, string>> {
  const members = await listActiveMembers(leagueId)
  const map: Record<string, string> = {}
  for (const m of members) map[m.id] = memberDisplayName(m)
  return map
}

export function memberDisplayName(m: MemberRow): string {
  return (
    m.fullName?.trim() ||
    m.name?.trim() ||
    m.nickname?.trim() ||
    m.teamName?.trim() ||
    m.email?.trim() ||
    'Member'
  )
}
