'use client'

import { useActionState } from 'react'
import { updateLeague, type UpdateLeagueResult } from '@/app/actions/leagues'
import { SPORT_OPTIONS } from '@/src/lib/league-options'
import { Field } from '@/components/ui/field'
import { FormMessage, FormSuccess } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from 'cn'

async function leagueDetailsAction(
  _prev: UpdateLeagueResult | undefined,
  formData: FormData,
): Promise<UpdateLeagueResult> {
  const leagueId = formData.get('leagueId') as string
  const name = formData.get('name')
  const sport = formData.get('sport')
  return updateLeague(leagueId, {
    name: typeof name === 'string' ? name : undefined,
    sport: typeof sport === 'string' ? sport : undefined,
  })
}

/**
 * Inline edit form for the two identity fields a commissioner may change on
 * the settings page: league name and sport. Everything else on that page
 * (slug, format, commissioner, financials) is either immutable or has its own
 * form.
 *
 * Non-commissioners get the same fields rendered disabled with no submit
 * button — the server action re-checks ownership regardless, so this is
 * presentation only.
 */
export default function LeagueDetailsForm({
  leagueId,
  name,
  sport,
  canEdit,
  className,
}: {
  leagueId: string
  name: string
  sport: string
  canEdit: boolean
  className?: string
}) {
  const [state, formAction, pending] = useActionState(leagueDetailsAction, undefined)

  return (
    <form action={formAction} className={cn('space-y-5', className)}>
      <input type="hidden" name="leagueId" value={leagueId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="League name"
          htmlFor="league-name"
          hint="2–80 characters. Shown across the app and in emails."
        >
          <Input
            id="league-name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            defaultValue={name}
            disabled={!canEdit}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Sport"
          htmlFor="league-sport"
          hint="Changing the sport does not alter existing rosters or scoring."
        >
          <Select
            id="league-sport"
            name="sport"
            defaultValue={sport}
            disabled={!canEdit}
          >
            {SPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state?.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state?.saved ? <FormSuccess>League details saved.</FormSuccess> : null}

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
