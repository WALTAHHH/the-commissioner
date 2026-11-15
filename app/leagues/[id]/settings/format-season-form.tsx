'use client'

import { useActionState } from 'react'
import { updateLeague, type UpdateLeagueResult } from '@/app/actions/leagues'
import { FORMAT_OPTIONS } from '@/src/lib/league-options'
import { Field } from '@/components/ui/field'
import { FormMessage, FormSuccess } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from 'cn'

/** Mirrors SEASON_YEAR_MIN / SEASON_YEAR_MAX in app/actions/leagues.ts. */
const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100

async function formatSeasonAction(
  _prev: UpdateLeagueResult | undefined,
  formData: FormData,
): Promise<UpdateLeagueResult> {
  const leagueId = formData.get('leagueId') as string
  const format = formData.get('format')

  const rawYear = formData.get('currentSeasonYear')
  const yearText = typeof rawYear === 'string' ? rawYear.trim() : ''

  let currentSeasonYear: number | undefined
  if (yearText !== '') {
    const parsed = Number(yearText)
    if (!Number.isInteger(parsed)) {
      return { error: 'Season year must be a whole number.' }
    }
    currentSeasonYear = parsed
  }

  return updateLeague(leagueId, {
    format: typeof format === 'string' ? format : undefined,
    currentSeasonYear,
  })
}

/**
 * Inline edit form for the two settings on the league settings page that are
 * neither identity (name/sport) nor financial: the scoring format and the year
 * of the current season. Both are written through the shared updateLeague()
 * action, which re-checks commissioner ownership server-side.
 *
 * Non-commissioners get the same fields rendered disabled with no submit
 * button — presentation only; the action is the real gate.
 */
export default function FormatSeasonForm({
  leagueId,
  format,
  currentSeasonYear,
  canEdit,
  className,
}: {
  leagueId: string
  format: string
  currentSeasonYear: number
  canEdit: boolean
  className?: string
}) {
  const [state, formAction, pending] = useActionState(formatSeasonAction, undefined)

  // Preserve a legacy format that predates FORMAT_OPTIONS so saving the season
  // year alone can never silently rewrite the format.
  const formatOptions: ReadonlyArray<{ value: string; label: string }> =
    FORMAT_OPTIONS.some((o) => o.value === format)
      ? FORMAT_OPTIONS
      : [{ value: format, label: format }, ...FORMAT_OPTIONS]

  return (
    <form action={formAction} className={cn('space-y-5', className)}>
      <input type="hidden" name="leagueId" value={leagueId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Format"
          htmlFor="league-format"
          hint="The league's scoring format, shown on the league header and settings."
        >
          <Select
            id="league-format"
            name="format"
            defaultValue={format}
            disabled={!canEdit}
          >
            {formatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Current season year"
          htmlFor="current-season-year"
          hint={`Whole year between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.`}
        >
          <Input
            id="current-season-year"
            name="currentSeasonYear"
            type="number"
            inputMode="numeric"
            min={SEASON_YEAR_MIN}
            max={SEASON_YEAR_MAX}
            step={1}
            required
            defaultValue={currentSeasonYear}
            disabled={!canEdit}
          />
        </Field>
      </div>

      {state?.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state?.saved ? <FormSuccess>Format and season year saved.</FormSuccess> : null}

      {canEdit ? (
        <div className="flex items-center gap-3 pt-1">
          <SubmitButton loading={pending}>Save changes</SubmitButton>
          {pending ? (
            <span className="text-sm text-muted-foreground">Saving…</span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only the commissioner can edit these fields.
        </p>
      )}
    </form>
  )
}
