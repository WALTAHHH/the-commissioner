'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewSleeperLeague } from '@/app/actions/integrations'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'
import { Zap } from 'lucide-react'

/**
 * Step 1, Option A: look up an existing Sleeper league before anything is
 * created. The fetch goes through the `previewSleeperLeague` server action
 * (read-only — no DB writes here); on success we push to the review step
 * (`?step=review&sleeperLeagueId=…`) with the league's fields carried along
 * as URL params, which `league-creation-form.tsx` renders pre-filled.
 *
 * The actual `integration_connections` row is only saved when the review
 * step is confirmed (`createLeague` then `connectSleeper`).
 */
export default function SleeperImportForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const raw = String(formData.get('sleeperLeagueId') ?? '').trim()
    // Accept a pasted Sleeper league URL as gracefully as a bare ID — the
    // helper text points at the URL, so people will paste it.
    const sleeperLeagueId = raw.match(/\d{4,32}/)?.[0] ?? raw

    if (!sleeperLeagueId) {
      setError('Enter the league ID from your Sleeper league URL.')
      setLoading(false)
      return
    }

    const result = await previewSleeperLeague(sleeperLeagueId)
    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not load that Sleeper league.')
      return
    }

    const params = new URLSearchParams({
      step: 'review',
      sleeperLeagueId,
      name: result.name ?? '',
      sport: result.sport ?? '',
      format: result.format ?? '',
      formatLabel: result.formatLabel ?? '',
      season: result.season ?? '',
      teamCount: String(result.teamCount ?? ''),
      memberCount: String(result.memberCount ?? ''),
    })
    router.push(`/leagues/new?${params.toString()}`)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
      <div className="mb-2 flex items-center gap-3">
        <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          Recommended
        </span>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500">
          <Zap className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Connect your Sleeper league
        </h2>
      </div>
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Already run your league on Sleeper? Import it and we&apos;ll pre-fill the
        details — the league stays on Sleeper; this app becomes its
        commissioner desk.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Sleeper league ID"
          htmlFor="sleeperLeagueId"
          hint={
            <>
              Find this in your Sleeper league URL — e.g.{''}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">
                sleeper.com/league/289646328504385536
              </code>
              . Pasting the whole URL works too.
            </>
          }
        >
          <Input
            id="sleeperLeagueId"
            name="sleeperLeagueId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            placeholder="289646328504385536"
            required
            disabled={loading}
            className="font-mono"
          />
        </Field>

        <FormMessage>{error}</FormMessage>

        <SubmitButton loading={loading} className="w-full py-3 text-base">
          Import from Sleeper
        </SubmitButton>
      </form>
    </div>
  )
}
