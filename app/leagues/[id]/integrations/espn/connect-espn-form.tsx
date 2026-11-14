'use client'

import { useState } from 'react'
import { connectESPN } from '@/app/actions/integrations'
import { Hash, Calendar, Lock, HelpCircle } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * ESPN connect form (ESPN-2). Fields:
 *  - ESPN League ID (numeric)
 *  - Season year (default current year)
 *  - Private league toggle → reveals espn_s2 and SWID fields with helper text
 *
 * The server action verifies the league exists via ESPNAdapter before saving,
 * and returns typed errors (invalid ID, private league needs cookies, expired
 * cookies, network). On success the action revalidates this route and the page
 * repaints as the connected view.
 */
export default function ConnectESPNForm({ leagueId }: { leagueId: string }) {
  const [error, setError] = useState('')
  const [needsCookies, setNeedsCookies] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setNeedsCookies(false)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const espnLeagueId = String(formData.get('espnLeagueId') ?? '')
    const seasonYear = String(formData.get('seasonYear') ?? '')
    const espnS2 = isPrivate ? String(formData.get('espnS2') ?? '') : undefined
    const swid = isPrivate ? String(formData.get('swid') ?? '') : undefined

    const result = await connectESPN(leagueId, {
      espnLeagueId,
      seasonYear,
      espnS2,
      swid,
    })
    setLoading(false)

    if (result?.error) {
      setError(result.error)
      setNeedsCookies(result.needsCookies ?? false)
      // If the error says needs cookies, auto-reveal the cookie fields
      if (result.needsCookies) {
        setIsPrivate(true)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">
        Connect an ESPN league
      </h2>

      <Field
        label={
          <>
            <Hash className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
            ESPN League ID
          </>
        }
        htmlFor="espnLeagueId"
        hint="Find this in your ESPN league URL: fantasy.espn.com/football/league?leagueId=1241838"
        error={error && !needsCookies ? error : null}
      >
        <Input
          id="espnLeagueId"
          name="espnLeagueId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          placeholder="1241838"
          required
          disabled={loading}
          className="max-w-sm font-mono"
          aria-invalid={error && !needsCookies ? true : undefined}
        />
      </Field>

      <Field
        label={
          <>
            <Calendar className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
            Season year
          </>
        }
        htmlFor="seasonYear"
        hint="Leave blank for the current season"
        error={null}
      >
        <Input
          id="seasonYear"
          name="seasonYear"
          type="number"
          min="1999"
          max="2100"
          step="1"
          placeholder={new Date().getFullYear().toString()}
          disabled={loading}
          className="max-w-xs"
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="privateToggle"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="privateToggle" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Lock className="h-4 w-4" />
            Private league
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Enable this if your ESPN league requires signing in. You’ll need to provide your
          espn_s2 and SWID session cookies.
        </p>
      </div>

      {isPrivate && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <HelpCircle className="h-4 w-4" />
              How to find your cookies
            </div>
            <p className="text-xs text-muted-foreground">
              Find these in your browser’s DevTools while logged into ESPN Fantasy.
              Open DevTools → Application → Cookies → espn.com.
            </p>
          </div>

          <Field
            label="espn_s2 cookie"
            htmlFor="espnS2"
            hint="Paste the whole cookie value — quotes and name prefix are stripped automatically"
            error={needsCookies && error ? error : null}
          >
            <Input
              id="espnS2"
              name="espnS2"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="AQAAAAB... (long string)"
              required={isPrivate}
              disabled={loading}
              className="font-mono"
            />
          </Field>

          <Field
            label="SWID cookie"
            htmlFor="swid"
            hint="Usually looks like {...} (SWID includes curly braces)"
            error={null}
          >
            <Input
              id="swid"
              name="swid"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="{...}"
              required={isPrivate}
              disabled={loading}
              className="font-mono"
            />
          </Field>
        </div>
      )}

      {error && (
        <FormMessage>{error}</FormMessage>
      )}

      <SubmitButton loading={loading} className="w-full sm:w-auto">
        Connect league
      </SubmitButton>
    </form>
  )
}