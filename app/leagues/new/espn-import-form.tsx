'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ESPNLeagueView } from '@/src/lib/integrations/espn/snapshot'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'
import ProviderLogo from '@/components/provider-logo'

/**
 * Serializable in/out contract for the inline `verifyESPN` Server Function
 * that `page.tsx` defines and passes down here. Keeping the types in this
 * file means the Server Function and the form can never drift apart — the
 * page imports both from here.
 */
export type ESPNVerifyInput = {
  leagueId: string
  seasonYear: string
  espnS2?: string
  swid?: string
}

export type ESPNVerifyResponse =
  | { ok: true; league: ESPNLeagueView }
  | {
      ok: false
      /** User-facing sentence (built by `describeESPNError` server-side). */
      error: string
      /** Drives copy only for now; kept for future error styling hooks. */
      kind: string
      /** ESPN wants/needs cookies — auto-reveal the private-league fields. */
      needsCookies: boolean
    }

interface EspnImportFormProps {
  verifyESPN: (input: ESPNVerifyInput) => Promise<ESPNVerifyResponse>
}

/**
 * Accepts a bare league ID or a pasted ESPN league URL
 * (`.../football/league?leagueId=1241838&seasonId=2024`). The `leagueId`
 * query key is matched first so a pasted URL with a seasonId can't be
 * mistaken for the league number; bare digits pass through untouched.
 */
function parseESPNLeagueId(raw: string): string {
  const trimmed = raw.trim()
  const fromUrl = trimmed.match(/[?&]leagueId=(\d{4,12})/)?.[1]
  return fromUrl ?? trimmed
}

/**
 * Step 1, Option B: look up an existing ESPN league before anything is
 * created. Mirrors `sleeper-import-form.tsx`: the ESPN read runs through
 * the inline `verifyESPN` Server Function on the page (server-side so the
 * adapter can send `espn_s2`/`SWID` cookies — a browser fetch would silently
 * drop the `Cookie` header), and on success we push to the review step
 * (`?step=review&espnLeagueId=…`) carrying the league fields as URL params.
 *
 * Nothing is written to our DB here; the `integration_connections` row only
 * happens later from the league's integrations hub (ESPN-2), so the review
 * step just imports the league's name/season and shows the ESPN badge.
 */
export default function EspnImportForm({ verifyESPN }: EspnImportFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [privateLeague, setPrivateLeague] = useState(false)
  const [espnS2, setEspnS2] = useState('')
  const [swid, setSwid] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const leagueId = parseESPNLeagueId(String(formData.get('espnLeagueId') ?? ''))
    const seasonYear = String(formData.get('seasonYear') ?? '').trim()

    if (!leagueId) {
      setError('Enter the league ID from your ESPN league URL.')
      setLoading(false)
      return
    }

    const result = await verifyESPN({
      leagueId,
      seasonYear,
      espnS2: privateLeague ? espnS2 : undefined,
      swid: privateLeague ? swid : undefined,
    })
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      // ESPN refused for want of cookies — show the fields instead of only
      // telling the user about them (same affordance as the hub's form).
      if (result.needsCookies) setPrivateLeague(true)
      return
    }

    const params = new URLSearchParams({
      step: 'review',
      espnLeagueId: leagueId,
      name: result.league.name,
      sport: 'football',
      season: String(result.league.seasonYear),
      seasonYear: String(result.league.seasonYear),
    })
    if (privateLeague && espnS2 && swid) {
      params.set('espnS2', espnS2)
      params.set('swid', swid)
    }
    router.push(`/leagues/new?${params.toString()}`)
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <ProviderLogo provider="espn" size="card" variant="square" />
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Connect your ESPN league
        </h2>
      </div>
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Run your league on ESPN Fantasy? Import it and we&apos;ll pre-fill the
        details — the league stays on ESPN; this app becomes its commissioner
        desk.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="ESPN league ID"
          htmlFor="espnLeagueId"
          hint={
            <>
              Find it in your ESPN league URL — e.g.{' '}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">
                fantasy.espn.com/football/league?leagueId=1241838
              </code>
              . Pasting the whole URL works too.
            </>
          }
        >
          <Input
            id="espnLeagueId"
            name="espnLeagueId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            placeholder="1241838"
            required
            disabled={loading}
            className="font-mono"
          />
        </Field>

        <Field
          label="Season year"
          htmlFor="seasonYear"
          hint="ESPN leagues are organized one season at a time — pick the year the league was created for."
        >
          <Input
            id="seasonYear"
            name="seasonYear"
            type="number"
            inputMode="numeric"
            min={1999}
            max={currentYear + 1}
            step={1}
            defaultValue={currentYear}
            required
            disabled={loading}
            className="font-mono"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={privateLeague}
            onChange={(e) => setPrivateLeague(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
            disabled={loading}
          />
          This is a private league
        </label>

        {privateLeague && (
          <div className="space-y-5 rounded-xl border border-dashed border-border p-4">
            <p className="text-xs text-muted-foreground">
              ESPN has no official API — private leagues are readable only with
              your own session cookies from a logged-in ESPN browser window
              (DevTools → Application → Cookies). They are used just to verify
              the league here.
            </p>
            <Field label="espn_s2 cookie" htmlFor="espnS2">
              <Input
                id="espnS2"
                name="espnS2"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the espn_s2 value"
                value={espnS2}
                onChange={(e) => setEspnS2(e.target.value)}
                disabled={loading}
                className="font-mono"
              />
            </Field>
            <Field label="SWID cookie" htmlFor="swid">
              <Input
                id="swid"
                name="swid"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="{ABCD1234-…} or the SWID value"
                value={swid}
                onChange={(e) => setSwid(e.target.value)}
                disabled={loading}
                className="font-mono"
              />
            </Field>
          </div>
        )}

        <FormMessage>{error}</FormMessage>

        <SubmitButton loading={loading} className="w-full py-3 text-base">
          Import from ESPN
        </SubmitButton>
      </form>
    </div>
  )
}
