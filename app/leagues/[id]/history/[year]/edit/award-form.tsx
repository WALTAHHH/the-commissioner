'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createAward } from '@/app/actions/history'
import type { MemberOption } from '../../season-record-form'

const MAX_AWARD_NAME = 200
const MAX_DESCRIPTION = 1000

/**
 * Add an award to a season (commissioner). Leave recipient empty for team
 * awards. Validation mirrors `createAward`; duplicate names within a season
 * are rejected by a unique index and surfaced as a friendly error.
 */
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
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    setSaved(null)
    const name = awardName.trim()
    if (!name) {
      setError('Award name is required.')
      return
    }
    if (name.length > MAX_AWARD_NAME) {
      setError(`Award name must be at most ${MAX_AWARD_NAME} characters.`)
      return
    }
    if (description.trim().length > MAX_DESCRIPTION) {
      setError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
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
        setError(result.error)
        return
      }
      setSaved(`"${name}" added.`)
      setAwardName('')
      setMemberId('')
      setDescription('')
      router.refresh()
    })
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`award-name-${seasonYear}`} className="mb-1.5 block text-sm font-medium text-foreground">
            Award name
          </label>
          <input
            id={`award-name-${seasonYear}`}
            type="text"
            value={awardName}
            onChange={(e) => setAwardName(e.target.value)}
            placeholder="MVP, Iron Streak, Best Record…"
            maxLength={MAX_AWARD_NAME}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`award-member-${seasonYear}`} className="mb-1.5 block text-sm font-medium text-foreground">
            Recipient
          </label>
          <select
            id={`award-member-${seasonYear}`}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className={inputClass}
          >
            <option value="">— team award (no member) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`award-desc-${seasonYear}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Description
        </label>
        <textarea
          id={`award-desc-${seasonYear}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={MAX_DESCRIPTION}
          placeholder="Why it was given (optional)"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {saved}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Adding…' : 'Add award'}
      </button>
    </div>
  )
}
