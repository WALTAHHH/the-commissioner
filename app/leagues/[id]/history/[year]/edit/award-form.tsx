'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createAward } from '@/app/actions/history'
import type { MemberOption } from '../../season-record-form'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage, FormSuccess } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

const MAX_AWARD_NAME = 200
const MAX_DESCRIPTION = 1000

/**
 * Add an award to a season (commissioner). Leave recipient empty for team
 * awards. Validation mirrors `createAward`; duplicate names within a season
 * are rejected by a unique index and surfaced as a friendly server banner.
 *
 * This form stays mounted after a save (awards are added one after another),
 * so success feedback is an inline FormSuccess, not a redirect.
 */
type FieldKey = 'awardName' | 'description'

interface FormError {
  message: string
  field?: FieldKey
}

export default function AwardForm({
  leagueId,
  seasonYear,
  members,
}: {
  leagueId: string
  seasonYear: number
  members: MemberOption[]
}) {
  const router = useRouter()
  const [awardName, setAwardName] = useState('')
  const [memberId, setMemberId] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function submit() {
    setError(null)
    setSaved(null)
    const name = awardName.trim()
    if (!name) {
      setError({ message: 'Award name is required.', field: 'awardName' })
      return
    }
    if (name.length > MAX_AWARD_NAME) {
      setError({ message: `Award name must be at most ${MAX_AWARD_NAME} characters.`, field: 'awardName' })
      return
    }
    if (description.trim().length > MAX_DESCRIPTION) {
      setError({ message: `Description must be at most ${MAX_DESCRIPTION} characters.`, field: 'description' })
      return
    }

    startTransition(async () => {
      const result = await createAward(leagueId, {
        seasonYear,
        memberId: memberId || undefined,
        awardName: name,
        description: description.trim() || undefined,
      })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      setSaved(`"${name}" added.`)
      setAwardName('')
      setMemberId('')
      setDescription('')
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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Award name"
          htmlFor={`award-name-${seasonYear}`}
          error={fieldError('awardName')}
        >
          <Input
            id={`award-name-${seasonYear}`}
            type="text"
            value={awardName}
            maxLength={MAX_AWARD_NAME}
            disabled={pending}
            onChange={(e) => setAwardName(e.target.value)}
            placeholder="MVP, Iron Streak, Best Record…"
            aria-invalid={fieldError('awardName') ? true : undefined}
          />
        </Field>
        <Field
          label="Recipient"
          htmlFor={`award-member-${seasonYear}`}
        >
          <Select
            id={`award-member-${seasonYear}`}
            value={memberId}
            disabled={pending}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">— team award (no member) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor={`award-desc-${seasonYear}`}
        hint="Why it was given (optional)."
        error={fieldError('description')}
      >
        <Textarea
          id={`award-desc-${seasonYear}`}
          value={description}
          rows={2}
          maxLength={MAX_DESCRIPTION}
          disabled={pending}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={fieldError('description') ? true : undefined}
        />
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}
      {saved && <FormSuccess>{saved}</FormSuccess>}

      <SubmitButton loading={pending} className="w-full sm:w-auto">Add award</SubmitButton>
    </form>
  )
}
