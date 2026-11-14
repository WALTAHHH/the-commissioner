'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSeasonRecord } from '@/app/actions/history'

const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100
const MAX_TEAM_NAME = 200
const MAX_NOTES = 1000

export type MemberOption = { id: string; label: string }

export type SeasonRecordInitial = {
  seasonYear: number
  championMemberId: string
  championTeamName: string
  runnerUpMemberId: string
  notes: string
}

/**
 * Season record form — create (`/history/new`) and correct
 * (`/history/[year]/edit`) share it; `createSeasonRecord` upserts on
 * (league, season) so both paths hit the same action.
 *
 * Validation mirrors the action layer (the action is the authority): at
 * least one of champion member / champion team name, year in range, notes
 * capped. Member selects are only ever fed this league's active members,
 * but the action re-verifies membership server-side regardless.
 */
export default function SeasonRecordForm({
  leagueId,
  members,
  initial,
  submitLabel = 'Save season record',
}: {
  leagueId: string
  members: MemberOption[]
  initial?: Partial<SeasonRecordInitial>
  submitLabel?: string
}) {
  const router = useRouter()
  const [seasonYear, setSeasonYear] = useState<string>(
    String(initial?.seasonYear ?? new Date().getUTCFullYear()),
  )
  const [championMemberId, setChampionMemberId] = useState(initial?.championMemberId ?? '')
  const [championTeamName, setChampionTeamName] = useState(initial?.championTeamName ?? '')
  const [runnerUpMemberId, setRunnerUpMemberId] = useState(initial?.runnerUpMemberId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const year = Number(seasonYear)
    if (!Number.isInteger(year) || year < SEASON_YEAR_MIN || year > SEASON_YEAR_MAX) {
      setError(`Season year must be a whole number between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.`)
      return
    }
    if (!championMemberId && !championTeamName.trim()) {
      setError('Pick a champion member or type a champion team name.')
      return
    }
    if (championTeamName.trim().length > MAX_TEAM_NAME) {
      setError(`Champion team name must be at most ${MAX_TEAM_NAME} characters.`)
      return
    }
    if (notes.trim().length > MAX_NOTES) {
      setError(`Notes must be at most ${MAX_NOTES} characters.`)
      return
    }

    startTransition(async () => {
      const result = await createSeasonRecord(leagueId, {
        seasonYear: year,
        championMemberId: championMemberId || undefined,
        championTeamName: championTeamName.trim() || undefined,
        runnerUpMemberId: runnerUpMemberId || undefined,
        notes: notes.trim() || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/history`)
      router.refresh()
    })
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`year-${leagueId}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Season year
        </label>
        <input
          id={`year-${leagueId}`}
          type="number"
          inputMode="numeric"
          min={SEASON_YEAR_MIN}
          max={SEASON_YEAR_MAX}
          step={1}
          value={seasonYear}
          onChange={(e) => setSeasonYear(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`champ-member-${leagueId}`} className="mb-1.5 block text-sm font-medium text-foreground">
            Champion (member)
          </label>
          <select
            id={`champ-member-${leagueId}`}
            value={championMemberId}
            onChange={(e) => setChampionMemberId(e.target.value)}
            className={inputClass}
          >
            <option value="">— none —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`champ-team-${leagueId}`} className="mb-1.5 block text-sm font-medium text-foreground">
            Champion team name
          </label>
          <input
            id={`champ-team-${leagueId}`}
            type="text"
            value={championTeamName}
            onChange={(e) => setChampionTeamName(e.target.value)}
            placeholder="Optional if a member is selected"
            maxLength={MAX_TEAM_NAME}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`runner-${leagueId}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Runner-up (member)
        </label>
        <select
          id={`runner-${leagueId}`}
          value={runnerUpMemberId}
          onChange={(e) => setRunnerUpMemberId(e.target.value)}
          className={inputClass}
        >
          <option value="">— none —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`notes-${leagueId}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Notes
        </label>
        <textarea
          id={`notes-${leagueId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={MAX_NOTES}
          placeholder="Championship results, drama, anything worth remembering"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {notes.trim().length}/{MAX_NOTES}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}
