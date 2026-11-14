'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Plus, X, Loader2 } from 'lucide-react'
import { createPoll } from '@/app/actions/governance'
import type { PollThreshold, PollType } from '@/src/db/schema/governance'

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
 */
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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
      setError('Title is required.')
      return
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setError(`Title must be at most ${MAX_TITLE} characters.`)
      return
    }
    if (description.length > MAX_DESCRIPTION) {
      setError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
      return
    }

    const filled: string[] = []
    for (const option of options) {
      const value = option.trim()
      if (!value) {
        setError('Every option needs text — remove the blank one or fill it in.')
        return
      }
      if (value.length > MAX_OPTION_CHARS) {
        setError(`Each option must be at most ${MAX_OPTION_CHARS} characters.`)
        return
      }
      filled.push(value)
    }
    if (filled.length < 2) {
      setError('At least two options are required.')
      return
    }
    if (new Set(filled).size < filled.length) {
      setError('Options must be distinct.')
      return
    }

    if (
      !Number.isInteger(windowHours) ||
      windowHours < MIN_WINDOW_HOURS ||
      windowHours > MAX_WINDOW_HOURS
    ) {
      setError(`Voting window must be between ${MIN_WINDOW_HOURS} and ${MAX_WINDOW_HOURS} hours.`)
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
        setError(
          `A custom threshold needs a whole number between ${MIN_CUSTOM_THRESHOLD} and ${MAX_CUSTOM_THRESHOLD} votes.`,
        )
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
        setError(result.error ?? 'Failed to create poll.')
        return
      }
      router.push(`/leagues/${leagueId}/governance/polls/${result.pollId}`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Title */}
      <Field label="Title" hint={`${title.length}/${MAX_TITLE}`}>
        <input
          type="text"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Should we move the trade deadline?"
          className={INPUT_CLASS}
        />
      </Field>

      {/* Description */}
      <Field label="Description" hint="Optional">
        <textarea
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Context so everyone is voting on the same question."
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      {/* Type */}
      <Field label="Type">
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
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
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
      <Field label="Approval threshold" hint="How the winner has to win">
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
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
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
            <label
              htmlFor="custom-threshold"
              className="block text-sm font-medium text-foreground"
            >
              Winning option needs at least
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                votes (whole number, {MIN_CUSTOM_THRESHOLD}–{MAX_CUSTOM_THRESHOLD})
              </span>
            </label>
            <input
              id="custom-threshold"
              type="number"
              min={MIN_CUSTOM_THRESHOLD}
              max={MAX_CUSTOM_THRESHOLD}
              step={1}
              value={customThreshold}
              onChange={(e) => setCustomThreshold(e.target.value)}
              className={`${INPUT_CLASS} mt-2 w-32`}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Majority, supermajority and unanimity are measured against votes cast, not
          league membership — turnout is shown separately on every poll. A custom
          threshold is an absolute number of votes for the winning option.
        </p>
      </Field>

      {/* Options */}
      <Field
        label="Options"
        hint={`${options.length} of ${MAX_OPTIONS} · at least 2`}
      >
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {index + 1}
              </span>
              <input
                type="text"
                value={option}
                maxLength={MAX_OPTION_CHARS}
                onChange={(e) => setOption(index, e.target.value)}
                placeholder={index === 0 ? 'First option' : 'Another option'}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => removeOption(index)}
                disabled={options.length <= 2}
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
          disabled={options.length >= MAX_OPTIONS}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Add option
        </button>
      </Field>

      {/* Voting window */}
      <Field label="Voting window" hint={`${windowHours} hours`}>
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((preset) => (
            <button
              key={preset.hours}
              type="button"
              onClick={() => {
                setWindowHours(preset.hours)
                setCustomWindow(false)
              }}
              aria-pressed={!customWindow && windowHours === preset.hours}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
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
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              customWindow
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Custom
          </button>
          {customWindow && (
            <input
              type="number"
              min={MIN_WINDOW_HOURS}
              max={MAX_WINDOW_HOURS}
              step={1}
              value={windowHours}
              onChange={(e) => setWindowHours(Math.trunc(Number(e.target.value)))}
              aria-label="Voting window in hours"
              className={`${INPUT_CLASS} w-28`}
            />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The poll shows a countdown to this deadline. It is not closed automatically — the
          commissioner closes it to record the result.
        </p>
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
          onClick={() => router.push(`/leagues/${leagueId}/governance`)}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : 'Create poll'}
        </button>
      </div>
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30'

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
