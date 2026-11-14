'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDispute } from '@/app/actions/governance'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

const MAX_DESCRIPTION = 5000

/**
 * Raise-dispute form (Governance-2) — any active member, not only the
 * commissioner: `createDispute` requires an active membership and then asks
 * the authorization layer, so the button is open to the whole league.
 *
 * Field limits mirror the action rather than inventing their own; the action
 * is the authority and a submission it rejects should never look submittable.
 */
export default function DisputeForm({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const trimmed = description.trim()
    if (!trimmed) {
      setError('Describe what is being disputed.')
      return
    }
    if (trimmed.length > MAX_DESCRIPTION) {
      setError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
      return
    }

    startTransition(async () => {
      const result = await createDispute(leagueId, { description: trimmed })
      if (result.error || !result.disputeId) {
        setError(result.error ?? 'Failed to raise the dispute.')
        return
      }
      router.push(`/leagues/${leagueId}/governance/disputes`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mx-auto w-full max-w-2xl space-y-6"
    >
      <Field
        label="What is disputed?"
        htmlFor="dispute-description"
        hint={`${description.length}/${MAX_DESCRIPTION} characters. The commissioner rules on this and writes the resolution back into the record. Include dates, matchups and who was involved.`}
        error={error}
      >
        <Textarea
          id="dispute-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={6}
          disabled={pending}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Week 7 lineup was copied from another league's starting QB. I'm disputing the points for that matchup."
          aria-invalid={error ? true : undefined}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/leagues/${leagueId}/governance/disputes`)}
        >
          Cancel
        </SubmitButton>
        <SubmitButton loading={pending}>Raise dispute</SubmitButton>
      </div>
    </form>
  )
}
