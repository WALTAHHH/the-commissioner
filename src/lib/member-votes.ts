/**
 * Member profile → Votes read layer.
 *
 * Server-only — never import from a client component. Same layering as
 * `src/lib/member-obligations.ts`: reads go through the service-role client in
 * `src/lib/db.ts` (which bypasses RLS, so every query carries an explicit
 * `league_id` filter — that IS the tenant-isolation gate) and the page gates
 * access with `loadLeagueContext` before calling this loader.
 *
 * Column names are the raw database names (`poll_id`, `cast_at`); rows are
 * mapped to camelCase at this boundary so the section stays a pure view.
 *
 * The loader degrades to an empty list on a query error rather than throwing —
 * one transient PostgREST failure must not blank the whole profile.
 */

import { db } from '@/src/lib/db'
import { isUuid } from '@/src/lib/invitations'
import type { PollVoteRow } from '@/src/db/rows'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type MemberVoteView = {
  /** poll_votes.id — stable key for the list. */
  voteId: string
  pollId: string
  pollTitle: string
  /** 'open' | 'closed' | 'cancelled' — rendered as a label, not a gate. */
  pollStatus: string
  /** 'informal' | 'binding'. */
  pollType: string
  /** The option this member chose (or 'Option removed' if it was deleted). */
  optionText: string
  castAt: string
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

type RawVote = Pick<PollVoteRow, 'id' | 'poll_id' | 'option_id' | 'cast_at'>

/**
 * Every poll vote this member has cast, newest first, with the poll title /
 * status / type and the chosen option resolved.
 *
 * The votes are read by `member_id` (a `league_members.id`, globally unique),
 * then the polls are re-read with an explicit `league_id` filter and any vote
 * whose poll is not in this league is dropped — so a vote row can never surface
 * a poll from another league. Poll options are read by option id; a deleted
 * option falls back to a placeholder rather than a gap.
 */
export async function loadMemberVotesSection(
  leagueId: string,
  memberId: string,
): Promise<MemberVoteView[]> {
  if (!isUuid(leagueId) || !isUuid(memberId)) return []

  const { data: voteData, error: voteError } = await db
    .from('poll_votes')
    .select('id, poll_id, option_id, cast_at')
    .eq('member_id', memberId)
    .order('cast_at', { ascending: false })

  if (voteError) {
    console.error('loadMemberVotesSection votes error:', voteError)
    return []
  }

  const votes = (voteData ?? []) as unknown as RawVote[]
  if (votes.length === 0) return []

  const pollIds = Array.from(new Set(votes.map((v) => v.poll_id)))
  const optionIds = Array.from(new Set(votes.map((v) => v.option_id)))

  const [pollsResult, optionsResult] = await Promise.all([
    db
      .from('polls')
      .select('id, title, status, type, league_id')
      .in('id', pollIds)
      .eq('league_id', leagueId),
    db.from('poll_options').select('id, text').in('id', optionIds),
  ])

  if (pollsResult.error) {
    console.error('loadMemberVotesSection polls error:', pollsResult.error)
  }
  if (optionsResult.error) {
    console.error('loadMemberVotesSection options error:', optionsResult.error)
  }

  const pollById = new Map(
    ((pollsResult.data ?? []) as unknown as {
      id: string
      title: string
      status: string
      type: string
    }[]).map((p) => [p.id, p]),
  )
  const optionById = new Map(
    ((optionsResult.data ?? []) as unknown as { id: string; text: string }[]).map((o) => [
      o.id,
      o.text,
    ]),
  )

  // A vote whose poll is not in this league is silently dropped (see doc above).
  return votes
    .filter((v) => pollById.has(v.poll_id))
    .map((v) => {
      const poll = pollById.get(v.poll_id) as { title: string; status: string; type: string }
      return {
        voteId: v.id,
        pollId: v.poll_id,
        pollTitle: poll.title,
        pollStatus: poll.status,
        pollType: poll.type,
        optionText: optionById.get(v.option_id) ?? 'Option removed',
        castAt: v.cast_at,
      }
    })
}
