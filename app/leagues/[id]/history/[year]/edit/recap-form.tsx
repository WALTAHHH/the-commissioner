'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertSeasonRecap } from '@/app/actions/history'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage, FormSuccess } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

const MAX_BODY = 10000

/**
 * Season recap editor (commissioner). Markdown body, saved with
 * `upsertSeasonRecap` — one recap per (league, season); editing replaces
 * the body and moves updated_at. The editor stays mounted after saving
 * (it's a document editor, not a create-and-leave form), so success shows
 * inline; failures land in the body field's error slot or as a banner.
 */
interface FormError {
  message: string
  field?: 'body'
}

export default function RecapForm({
  leagueId,
  seasonYear,
  initialBody,
}: {
  leagueId: string
  seasonYear: number
  initialBody: string
}) {
  const router = useRouter()
  const [body, setBody] = useState(initialBody)
  const [error, setError] = useState<FormError | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const wasExisting = initialBody.trim().length > 0
  const bodyError = error?.field === 'body' ? error.message : null

  function submit() {
    setError(null)
    setSaved(false)
    const trimmed = body.trim()
    if (!trimmed) {
      setError({ message: 'Recap body is required.', field: 'body' })
      return
    }
    if (trimmed.length > MAX_BODY) {
      setError({
        message: `Recap body must be at most ${MAX_BODY.toLocaleString()} characters.`,
        field: 'body',
      })
      return
    }

    startTransition(async () => {
      const result = await upsertSeasonRecap(leagueId, seasonYear, { body: trimmed })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-3"
    >
      <Field
        label="Recap"
        htmlFor={`recap-${seasonYear}`}
        hint={`${body.trim().length.toLocaleString()}/${MAX_BODY.toLocaleString()} characters${wasExisting ? ' · saving updates the existing recap' : ''}`}
        error={bodyError}
      >
        <Textarea
          id={`recap-${seasonYear}`}
          value={body}
          rows={10}
          maxLength={MAX_BODY}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Markdown supported — how the season unfolded, notable storylines, standout performances…"
          className="font-mono placeholder:font-sans"
          aria-invalid={bodyError ? true : undefined}
        />
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}
      {saved && <FormSuccess>Recap saved.</FormSuccess>}

      <SubmitButton loading={pending} className="w-full sm:w-auto">
        {wasExisting ? 'Update recap' : 'Save recap'}
      </SubmitButton>
    </form>
  )
}
