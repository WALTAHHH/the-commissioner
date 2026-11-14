'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { recordDecision } from '@/app/actions/governance'
import type { PollOptionChoice } from '@/src/lib/governance'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

const MAX_TITLE = 200
const MAX_DESCRIPTION = 5000
const MAX_OUTCOME = 500

/**
 * Record-decision form (Governance-2, commissioner only).
 *
 * The manual twin of what `closePoll` writes for a passed binding vote.
 * Linking a poll is optional: plenty of verdicts come from a conversation,
 * not a ballot, and linking only claims "this decision resolves that vote",
 * so the picker lists real polls from this league and the action re-checks
 * the poll belongs here.
 *
 * Field limits mirror `recordDecision`'s own validation. All three of title,
 * description and outcome are required by the action, so the form requires
 * them too. Local validation renders per-field; server failures render as
 * one banner before the actions.
 */
type FieldKey = 'title' | 'description' | 'outcome'

interface FormError {
  message: string
  field?: FieldKey
}

export default function DecisionForm({
  leagueId,
  polls,
}: {
  leagueId: string
  polls: PollOptionChoice[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [outcome, setOutcome] = useState('')
  const [pollId, setPollId] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function submit() {
    setError(null)
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedOutcome = outcome.trim()

    if (!trimmedTitle) {
      setError({ message: 'Title is required.', field: 'title' })
      return
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setError({ message: `Title must be at most ${MAX_TITLE} characters.`, field: 'title' })
      return
    }
    if (!trimmedDescription) {
      setError({ message: 'Description is required — what was decided and why.', field: 'description' })
      return
    }
    if (trimmedDescription.length > MAX_DESCRIPTION) {
      setError({ message: `Description must be at most ${MAX_DESCRIPTION} characters.`, field: 'description' })
      return
    }
    if (!trimmedOutcome) {
      setError({ message: 'Outcome is required — the verdict itself, in one line.', field: 'outcome' })
      return
    }
    if (trimmedOutcome.length > MAX_OUTCOME) {
      setError({ message: `Outcome must be at most ${MAX_OUTCOME} characters.`, field: 'outcome' })
      return
    }

    startTransition(async () => {
      const result = await recordDecision(leagueId, {
        title: trimmedTitle,
        description: trimmedDescription,
        outcome: trimmedOutcome,
        ...(pollId ? { pollId } : {}),
      })
      if (result.error || !result.decisionId) {
        setError({ message: result.error ?? 'Failed to record decision.' })
        return
      }
      router.push(`/leagues/${leagueId}/governance/decisions`)
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
        label="Title"
        htmlFor="decision-title"
        hint={`${title.length}/${MAX_TITLE} characters`}
        error={fieldError('title')}
      >
        <Input
          id="decision-title"
          type="text"
          value={title}
          maxLength={MAX_TITLE}
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline moves to Week 9"
          aria-invalid={fieldError('title') ? true : undefined}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="decision-description"
        hint={`What was decided, and why. ${description.length}/${MAX_DESCRIPTION} characters.`}
        error={fieldError('description')}
      >
        <Textarea
          id="decision-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={5}
          disabled={pending}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was decided, and the reasoning behind it."
          aria-invalid={fieldError('description') ? true : undefined}
        />
      </Field>

      <Field
        label="Outcome"
        htmlFor="decision-outcome"
        hint={`The verdict itself, in one line. ${outcome.length}/${MAX_OUTCOME} characters.`}
        error={fieldError('outcome')}
      >
        <Textarea
          id="decision-outcome"
          value={outcome}
          maxLength={MAX_OUTCOME}
          rows={2}
          disabled={pending}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Approved 8–1. Effective immediately."
          aria-invalid={fieldError('outcome') ? true : undefined}
        />
      </Field>

      <Field
        label="Linked poll"
        hint="Optional — link the ballot this decision resolves."
      >
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50">
            <input
              type="radio"
              name="poll"
              checked={pollId === ''}
              onChange={() => setPollId('')}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0 text-sm text-foreground">
              Not from a vote
              <span className="mt-0.5 block text-xs text-muted-foreground">
                A ruling the commissioner made directly.
              </span>
            </span>
          </label>

          {polls.map((poll) => (
            <label
              key={poll.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                pollId === poll.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:bg-accent/50'
              }`}
            >
              <input
                type="radio"
                name="poll"
                checked={pollId === poll.id}
                onChange={() => setPollId(poll.id)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">{poll.title}</span>
              </span>
            </label>
          ))}

          {polls.length === 0 && (
            <p className="text-xs text-muted-foreground">
              This league has no polls yet, so there is nothing to link.
            </p>
          )}
        </div>
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/leagues/${leagueId}/governance/decisions`)}
        >
          Cancel
        </SubmitButton>
        <SubmitButton loading={pending}>Record decision</SubmitButton>
      </div>
    </form>
  )
}
