/**
 * Member profile → Awards & honours read layer.
 *
 * Server-only — same layering as `src/lib/member-obligations.ts` / `member-votes.ts`.
 * Reads go through the service-role client in `src/lib/db.ts` (bypasses RLS, so
 * every query carries an explicit `league_id` filter — that IS the tenant gate);
 * the page gates access with `loadLeagueContext` before calling this loader.
 *
 * Three sources are merged, newest season first:
 *   * `season_records` — championship / runner-up finishes (member ids);
 *   * `league_awards.member_id` — named league awards;
 *   * `prize_structure.winner_member_id` — awarded prizes (payout + recognition).
 *
 * Prize payouts carry a dollar amount, which is money: whether this viewer may
 * see it is resolved with the SAME ACL the Obligations section uses
 * (`resolveObligationsAccess`), so a league running `admin_only` /
 * `members_see_own` never leaks a payout figure on someone else's profile.
 * `showAmounts` tells the view whether amounts survived the gate.
 *
 * Every source degrades to contributing nothing on its own error rather than
 * blanking the section.
 */

import { db } from '@/src/lib/db'
import { isUuid } from '@/src/lib/invitations'
import {
  normalizeFinancialVisibility,
  resolveObligationsAccess,
} from '@/src/lib/member-obligations'
import type { LeagueAwardRow, PrizeStructureRow, SeasonRecordRow } from '@/src/db/rows'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type MemberAwardKind = 'champion' | 'runner_up' | 'award' | 'prize'

export type MemberAwardView = {
  /** Unique and stable: `<season_record id>:champion` / `:runner_up`, award id, or prize id. */
  id: string
  kind: MemberAwardKind
  seasonYear: number
  title: string
  description: string | null
  /** Dollars for prize payouts; null for championships/awards/recognitions, or when hidden. */
  amount: number | null
  occurredAt: string
}

export type MemberAwardsSectionView = {
  awards: MemberAwardView[]
  /** false when the league's financial_visibility hides money from this viewer. */
  showAmounts: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for direct testing)
// ---------------------------------------------------------------------------

function toDollars(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const KIND_RANK: Record<MemberAwardKind, number> = {
  champion: 0,
  runner_up: 1,
  award: 2,
  prize: 3,
}

/**
 * Newest season first; within a season, champion before runner-up before named
 * awards before prizes, then most recent. Pure, so the ordering is testable
 * without a database.
 */
export function rankAwards(awards: MemberAwardView[]): MemberAwardView[] {
  return [...awards].sort(
    (a, b) =>
      b.seasonYear - a.seasonYear ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      b.occurredAt.localeCompare(a.occurredAt),
  )
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

type LeagueFinanceRow = { financial_visibility: string | null }
type MemberIdentityRow = { id: string; user_id: string | null }

/**
 * Championships, runner-up finishes, named awards and prize wins for one
 * member, newest season first, with prize amounts shown only when this viewer
 * is entitled to see the league's money.
 */
export async function loadMemberAwardsSection({
  leagueId,
  memberId,
  viewerUserId,
  viewerIsCommissioner,
}: {
  leagueId: string
  memberId: string
  /** null for an unauthenticated viewer — never 'self', never 'full'. */
  viewerUserId: string | null
  viewerIsCommissioner: boolean
}): Promise<MemberAwardsSectionView> {
  if (!isUuid(leagueId) || !isUuid(memberId)) {
    return { awards: [], showAmounts: false }
  }

  const [leagueResult, memberResult, recordsResult, awardsResult, prizesResult] =
    await Promise.all([
      db
        .from('leagues')
        .select('financial_visibility')
        .eq('id', leagueId)
        .maybeSingle(),
      db
        .from('league_members')
        .select('id, user_id')
        .eq('league_id', leagueId)
        .eq('id', memberId)
        .maybeSingle(),
      db
        .from('season_records')
        .select('*')
        .eq('league_id', leagueId)
        .or(`champion_member_id.eq.${memberId},runner_up_member_id.eq.${memberId}`),
      db
        .from('league_awards')
        .select('*')
        .eq('league_id', leagueId)
        .eq('member_id', memberId),
      db
        .from('prize_structure')
        .select('*')
        .eq('league_id', leagueId)
        .eq('winner_member_id', memberId),
    ])

  for (const [label, result] of [
    ['league', leagueResult],
    ['member', memberResult],
    ['records', recordsResult],
    ['awards', awardsResult],
    ['prizes', prizesResult],
  ] as const) {
    if (result.error) console.error(`loadMemberAwardsSection ${label} error:`, result.error)
  }

  // Money gate: the same ACL the Obligations section uses, so a payout figure
  // never appears to a viewer who cannot see the league's finances.
  const visibility = normalizeFinancialVisibility(
    ((leagueResult.data ?? null) as unknown as LeagueFinanceRow | null)?.financial_visibility,
  )
  const member = (memberResult.data ?? null) as unknown as MemberIdentityRow | null
  const isSelf = Boolean(member?.user_id) && member?.user_id === viewerUserId
  const access = resolveObligationsAccess({ visibility, viewerIsCommissioner, isSelf })
  const showAmounts = access.state === 'visible'

  const out: MemberAwardView[] = []

  for (const record of (recordsResult.data ?? []) as unknown as SeasonRecordRow[]) {
    if (record.champion_member_id === memberId) {
      out.push({
        id: `${record.id}:champion`,
        kind: 'champion',
        seasonYear: record.season_year,
        title: 'League champion',
        description: record.notes,
        amount: null,
        occurredAt: record.created_at,
      })
    }
    if (record.runner_up_member_id === memberId) {
      out.push({
        id: `${record.id}:runner_up`,
        kind: 'runner_up',
        seasonYear: record.season_year,
        title: 'Runner-up',
        description: record.notes,
        amount: null,
        occurredAt: record.created_at,
      })
    }
  }

  for (const award of (awardsResult.data ?? []) as unknown as LeagueAwardRow[]) {
    out.push({
      id: award.id,
      kind: 'award',
      seasonYear: award.season_year,
      title: award.award_name,
      description: award.description,
      amount: null,
      occurredAt: award.created_at,
    })
  }

  for (const prize of (prizesResult.data ?? []) as unknown as PrizeStructureRow[]) {
    out.push({
      id: prize.id,
      kind: 'prize',
      seasonYear: prize.season_year,
      title: prize.description,
      description: null,
      amount: showAmounts && prize.type === 'payout' ? toDollars(prize.amount) : null,
      occurredAt: prize.awarded_at ?? prize.created_at,
    })
  }

  return { awards: rankAwards(out), showAmounts }
}
