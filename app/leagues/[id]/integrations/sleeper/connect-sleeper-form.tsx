'use client'

import { useState } from 'react'
import { connectSleeper } from '@/app/actions/integrations'
import { Hash } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * Sleeper connect form (Sleeper-2). One field: the numeric league ID from
 * the Sleeper league URL. The server action verifies the league exists via
 * the Sleeper API before saving, so every failure — malformed ID, unknown
 * league, already connected, unreachable API — comes back here in the
 * field's error slot. On success the action revalidates this route and the
 * page repaints as the connected view; no client-side navigation needed.
 */
export default function ConnectSleeperForm({ leagueId }: { leagueId: string }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const sleeperLeagueId = String(formData.get('sleeperLeagueId') ?? '')

    const result = await connectSleeper(leagueId, sleeperLeagueId)
    setLoading(false)

    if (result?.error) {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">
        Connect a Sleeper league
      </h2>

      <Field
        label={
          <>
            <Hash className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
            Sleeper League ID
          </>
        }
        htmlFor="sleeperLeagueId"
        hint={`Find this in your Sleeper league URL: sleeper.com/leagues/{league_id}`}
        error={error || null}
      >
        <Input
          id="sleeperLeagueId"
          name="sleeperLeagueId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          placeholder="289646328504385536"
          required
          disabled={loading}
          className="max-w-sm font-mono"
          aria-invalid={error ? true : undefined}
        />
      </Field>

      <SubmitButton loading={loading} className="w-full sm:w-auto">
        Connect league
      </SubmitButton>
    </form>
  )
}
