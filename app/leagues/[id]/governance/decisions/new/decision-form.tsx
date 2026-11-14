'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { recordDecision } from '@/app/actions/governance'
import type { PollOptionChoice } from '@/src/lib/governance'

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
 * them too.
 */
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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedOutcome = outcome.trim()

    if (!trimmedTitle) {
      setError('Title is required.')
      return
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setError(`Title must be at most ${MAX_TITLE} characters.`)
      return
    }
    if (!trimmedDescription) {
      setError('Description is required — what was decided and why.')
      return
    }
    if (trimmedDescription.length > MAX_DESCRIPTION) {
      setError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
      return
    }
    if (!trimmedOutcome) {
      setError('Outcome is required — the verdict itself, in one line.')
      return
    }
    if (trimmedOutcome.length > MAX_OUTCOME) {
      setError(`Outcome must be at most ${MAX_OUTCOME} characters.`)
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
        setError(result.error ?? 'Failed to record decision.')
        return
      }
      router.push(`/leagues/${leagueId}/governance/decisions`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Field label="Title" hint={`${title.length}/${MAX_TITLE}`}>
        <input
          type="text"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline moves to Week 9"
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Description" hint={`${description.length}/${MAX_DESCRIPTION}`}>
        <textarea
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={5}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was decided, and the reasoning behind it."
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      <Field label="Outcome" hint={`${outcome.length}/${MAX_OUTCOME}`}>
        <textarea
          value={outcome}
          maxLength={MAX_OUTCOME}
          rows={2}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Approved 8–1. Effective immediately."
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      <Field
        label="Linked poll"
        hint="Optional"
      >
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50">
            <input
              type="radio"
              name="poll"
              checked={pollId === ''}
              onChange={() => setPollId('')}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-sm text-foreground">
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
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
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

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push(`/leagues/${leagueId}/governance/decisions`)}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Recording…' : 'Record decision'}
        </button>
      </div>
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
