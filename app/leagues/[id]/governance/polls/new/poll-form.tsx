'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Plus, X } from 'lucide-react'
import { createPoll } from '@/app/actions/governance'
import type { PollThreshold, PollType } from '@/src/db/schema/governance'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

const MAX_TITLE = 200
const MAX_DESCRIPTION = 2000
const MAX_OPTION_CHARS = 500
const MAX_OPTIONS = 12
const MIN_WINDOW_HOURS = 1
const MAX_WINDOW_HOURS = 720
const MIN_CUSTOM_THRESHOLD = 1
const MAX_CUSTOM_THRESHOLD = 1000

const WINDOWS = [
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
] as const

/**
 * Create-poll form (Governance-2, commissioner only).
 *
 * Validation mirrors `createPoll` in the action layer rather than inventing
 * its own limits, because the action is the authority: a poll the action
 * rejects should never look submittable here. Options are dynamic
 * (add/remove/reorder-free), and at least two distinct, non-empty ones are
 * required before submit is meaningful.
 *
 * 'Custom' threshold asks for a minimum number of votes, because `createPoll`
 * only accepts it when `custom_threshold` is a real integer (1-1000) and
 * `closePoll` scores a custom poll as `leading votes >= custom_threshold`.
 * A custom poll with no number recorded could never meet its threshold, so
 * the form refuses to create one.
 *
 * Field errors render in the offending field's error slot; server-side
 * failures render as one banner before the actions.
 */
type FieldKey = 'title' | 'description' | 'options' | 'window' | 'customThreshold'

interface FormError {
  message: string
  field?: FieldKey
}

export default function PollForm({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<PollType>('informal')
  const [threshold, setThreshold] = useState<PollThreshold>('majority')
  const [customThreshold, setCustomThreshold] = useState<string>('5')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [windowHours, setWindowHours] = useState<number>(72)
  const [customWindow, setCustomWindow] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)))
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']))
  }

  function removeOption(index: number) {
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, i) => i !== index),
    )
  }

  function submit() {
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError({ message: 'Title is required.', field: 'title' })
      return
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setError({ message: `Title must be at most ${MAX_TITLE} characters.`, field: 'title' })
      return
    }
    if (description.length > MAX_DESCRIPTION) {
      setError({ message: `Description must be at most ${MAX_DESCRIPTION} characters.`, field: 'description' })
      return
    }

    const filled: string[] = []
    for (const option of options) {
      const value = option.trim()
      if (!value) {
        setError({ message: 'Every option needs text — remove the blank one or fill it in.', field: 'options' })
        return
      }
      if (value.length > MAX_OPTION_CHARS) {
        setError({ message: `Each option must be at most ${MAX_OPTION_CHARS} characters.`, field: 'options' })
        return
      }
      filled.push(value)
    }
    if (filled.length < 2) {
      setError({ message: 'At least two options are required.', field: 'options' })
      return
    }
    if (new Set(filled).size < filled.length) {
      setError({ message: 'Options must be distinct.', field: 'options' })
      return
    }

    if (
      !Number.isInteger(windowHours) ||
      windowHours < MIN_WINDOW_HOURS ||
      windowHours > MAX_WINDOW_HOURS
    ) {
      setError({ message: `Voting window must be between ${MIN_WINDOW_HOURS} and ${MAX_WINDOW_HOURS} hours.`, field: 'window' })
      return
    }

    // 'custom' is scored as an absolute vote count, so the number is required
    // — mirror createPoll's own guard instead of letting it reject the submit.
    let customThresholdValue: number | undefined
    if (threshold === 'custom') {
      const parsed = Number(customThreshold)
      if (
        !Number.isInteger(parsed) ||
        parsed < MIN_CUSTOM_THRESHOLD ||
        parsed > MAX_CUSTOM_THRESHOLD
      ) {
        setError({
          message: `A custom threshold needs a whole number between ${MIN_CUSTOM_THRESHOLD} and ${MAX_CUSTOM_THRESHOLD} votes.`,
          field: 'customThreshold',
        })
        return
      }
      customThresholdValue = parsed
    }

    startTransition(async () => {
      const result = await createPoll(leagueId, {
        title: trimmedTitle,
        description: description.trim() || undefined,
        type,
        threshold,
        customThreshold: customThresholdValue,
        options: filled,
        votingWindowHours: windowHours,
      })
      if (result.error || !result.pollId) {
        setError({ message: result.error ?? 'Failed to create poll.' })
        return
      }
      router.push(`/leagues/${leagueId}/governance/polls/${result.pollId}`)
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
      {/* Title */}
      <Field
        label="Title"
        htmlFor="poll-title"
        hint={`${title.length}/${MAX_TITLE} characters`}
        error={fieldError('title')}
      >
        <Input
          id="poll-title"
          type="text"
          value={title}
          maxLength={MAX_TITLE}
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Should we move the trade deadline?"
          aria-invalid={fieldError('title') ? true : undefined}
        />
      </Field>

      {/* Description */}
      <Field
        label="Description"
        htmlFor="poll-description"
        hint="Optional — context so everyone is voting on the same question."
        error={fieldError('description')}
      >
        <Textarea
          id="poll-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          disabled={pending}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Context so everyone is voting on the same question."
          aria-invalid={fieldError('description') ? true : undefined}
        />
      </Field>

      {/* Type */}
      <Field label="Type" hint="Informal is a temperature check; binding can record a decision.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { key: 'informal', label: 'Informal', hint: 'A temperature check. Nothing is decided automatically.' },
              { key: 'binding', label: 'Binding', hint: 'If the threshold is met, closing it records a decision.' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setType(option.key)}
              aria-pressed={type === option.key}
              disabled={pending}
              className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                type === option.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {option.key === 'binding' ? <Link2 className="h-4 w-4" /> : null}
                {option.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Threshold */}
      <Field
        label="Approval threshold"
        hint="Majority, supermajority and unanimity are measured against votes cast, not league membership — turnout is shown separately on every poll. A custom threshold is an absolute number of votes for the winning option."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { key: 'majority', label: 'Majority', hint: '>50% of votes' },
              { key: 'supermajority', label: 'Supermajority', hint: '>⅔ of votes' },
              { key: 'unanimous', label: 'Unanimous', hint: 'All votes' },
              { key: 'custom', label: 'Custom', hint: 'A fixed number of votes' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setThreshold(option.key)}
              aria-pressed={threshold === option.key}
              disabled={pending}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                threshold === option.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
        {threshold === 'custom' && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <Field
              label="Winning option needs at least"
              htmlFor="custom-threshold"
              hint={`Whole number of votes, ${MIN_CUSTOM_THRESHOLD}–${MAX_CUSTOM_THRESHOLD}.`}
              error={fieldError('customThreshold')}
            >
              <Input
                id="custom-threshold"
                type="number"
                min={MIN_CUSTOM_THRESHOLD}
                max={MAX_CUSTOM_THRESHOLD}
                step={1}
                value={customThreshold}
                disabled={pending}
                onChange={(e) => setCustomThreshold(e.target.value)}
                className="w-32"
                aria-invalid={fieldError('customThreshold') ? true : undefined}
              />
            </Field>
          </div>
        )}
      </Field>

      {/* Options */}
      <Field
        label="Options"
        hint={`${options.length} of ${MAX_OPTIONS} · at least 2, all distinct`}
        error={fieldError('options')}
      >
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {index + 1}
              </span>
              <Input
                type="text"
                value={option}
                maxLength={MAX_OPTION_CHARS}
                disabled={pending}
                onChange={(e) => setOption(index, e.target.value)}
                placeholder={index === 0 ? 'First option' : 'Another option'}
                aria-label={`Option ${index + 1}`}
                aria-invalid={fieldError('options') ? true : undefined}
              />
              <button
                type="button"
                onClick={() => removeOption(index)}
                disabled={options.length <= 2 || pending}
                aria-label={`Remove option ${index + 1}`}
                className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS || pending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Add option
        </button>
      </Field>

      {/* Voting window */}
      <Field label="Voting window" hint={`${windowHours} hours — the poll shows a countdown to this deadline. It is not closed automatically; the commissioner closes it to record the result.`} error={fieldError('window')}>
        <div className="flex flex-wrap items-center gap-2">
          {WINDOWS.map((preset) => (
            <button
              key={preset.hours}
              type="button"
              onClick={() => {
                setWindowHours(preset.hours)
                setCustomWindow(false)
              }}
              aria-pressed={!customWindow && windowHours === preset.hours}
              disabled={pending}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                !customWindow && windowHours === preset.hours
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomWindow(true)}
            aria-pressed={customWindow}
            disabled={pending}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
              customWindow
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Custom
          </button>
          {customWindow && (
            <Input
              type="number"
              min={MIN_WINDOW_HOURS}
              max={MAX_WINDOW_HOURS}
              step={1}
              value={windowHours}
              disabled={pending}
              onChange={(e) => setWindowHours(Math.trunc(Number(e.target.value)))}
              aria-label="Voting window in hours"
              className="w-28"
              aria-invalid={fieldError('window') ? true : undefined}
            />
          )}
        </div>
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/leagues/${leagueId}/governance`)}
        >
          Cancel
        </SubmitButton>
        <SubmitButton loading={pending}>Create poll</SubmitButton>
      </div>
    </form>
  )
}
