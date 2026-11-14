'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSeasonRecord } from '@/app/actions/history'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

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
 *
 * Field-specific failures render in that field's error slot; the
 * champion-member-or-team-name check spans two controls, so it (and any
 * server failure) renders as a banner.
 */
type FieldKey = 'seasonYear' | 'championTeamName' | 'notes'

interface FormError {
  message: string
  field?: FieldKey
}

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
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function submit() {
    setError(null)
    const year = Number(seasonYear)
    if (!Number.isInteger(year) || year < SEASON_YEAR_MIN || year > SEASON_YEAR_MAX) {
      setError({
        message: `Season year must be a whole number between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.`,
        field: 'seasonYear',
      })
      return
    }
    if (!championMemberId && !championTeamName.trim()) {
      setError({ message: 'Pick a champion member or type a champion team name.' })
      return
    }
    if (championTeamName.trim().length > MAX_TEAM_NAME) {
      setError({ message: `Champion team name must be at most ${MAX_TEAM_NAME} characters.`, field: 'championTeamName' })
      return
    }
    if (notes.trim().length > MAX_NOTES) {
      setError({ message: `Notes must be at most ${MAX_NOTES} characters.`, field: 'notes' })
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
        setError({ message: result.error })
        return
      }
      router.push(`/leagues/${leagueId}/history`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-5"
    >
      <Field
        label="Season year"
        htmlFor={`year-${leagueId}`}
        error={fieldError('seasonYear')}
      >
        <Input
          id={`year-${leagueId}`}
          type="number"
          inputMode="numeric"
          min={SEASON_YEAR_MIN}
          max={SEASON_YEAR_MAX}
          step={1}
          value={seasonYear}
          disabled={pending}
          onChange={(e) => setSeasonYear(e.target.value)}
          aria-invalid={fieldError('seasonYear') ? true : undefined}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Champion (member)"
          htmlFor={`champ-member-${leagueId}`}
          hint="Leave both champion fields empty only if this season has no champion to record."
        >
          <Select
            id={`champ-member-${leagueId}`}
            value={championMemberId}
            disabled={pending}
            onChange={(e) => setChampionMemberId(e.target.value)}
          >
            <option value="">— none —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Champion team name"
          htmlFor={`champ-team-${leagueId}`}
          error={fieldError('championTeamName')}
        >
          <Input
            id={`champ-team-${leagueId}`}
            type="text"
            value={championTeamName}
            maxLength={MAX_TEAM_NAME}
            disabled={pending}
            onChange={(e) => setChampionTeamName(e.target.value)}
            placeholder="Optional if a member is selected"
            aria-invalid={fieldError('championTeamName') ? true : undefined}
          />
        </Field>
      </div>

      <Field
        label="Runner-up (member)"
        htmlFor={`runner-${leagueId}`}
      >
        <Select
          id={`runner-${leagueId}`}
          value={runnerUpMemberId}
          disabled={pending}
          onChange={(e) => setRunnerUpMemberId(e.target.value)}
        >
          <option value="">— none —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Notes"
        htmlFor={`notes-${leagueId}`}
        hint={`${notes.trim().length}/${MAX_NOTES} characters`}
        error={fieldError('notes')}
      >
        <Textarea
          id={`notes-${leagueId}`}
          value={notes}
          rows={3}
          maxLength={MAX_NOTES}
          disabled={pending}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Championship results, drama, anything worth remembering"
          aria-invalid={fieldError('notes') ? true : undefined}
        />
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <SubmitButton loading={pending} className="w-full sm:w-auto">
        {submitLabel}
      </SubmitButton>
    </form>
  )
}
