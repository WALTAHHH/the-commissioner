'use client'

import { useState } from 'react'
import { updateESPNCookies } from '@/app/actions/integrations'
import { Lock, Check, X } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * Inline "Update cookies" control for private ESPN connections.
 *
 * Toggles a small inline form with two password fields (espn_s2, SWID).
 * On success the page revalidates via the action's revalidatePath, clearing
 * any "auth_required" status and refreshing the snapshot.
 */
export default function UpdateCookiesButton({ connectionId }: { connectionId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess(false)

    const formData = new FormData(e.currentTarget)
    const espnS2 = String(formData.get('espnS2') ?? '')
    const swid = String(formData.get('swid') ?? '')

    const result = await updateESPNCookies(connectionId, { espnS2, swid })
    setBusy(false)

    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => {
        setShowForm(false)
        setSuccess(false)
      }, 2000)
    }
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring/60 hover:bg-accent/40 sm:w-auto"
      >
        <Lock className="mr-2 h-4 w-4" />
        Update cookies
      </button>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Update ESPN cookies</h3>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="espn_s2 cookie"
          htmlFor="espnS2"
          hint="Paste the fresh cookie value"
        >
          <Input
            id="espnS2"
            name="espnS2"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="AQAAAAB..."
            required
            disabled={busy}
            className="font-mono"
          />
        </Field>

        <Field
          label="SWID cookie"
          htmlFor="swid"
          hint="Usually looks like {...}"
        >
          <Input
            id="swid"
            name="swid"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="{...}"
            required
            disabled={busy}
            className="font-mono"
          />
        </Field>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        {success && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Cookies updated successfully
          </p>
        )}

        <div className="flex gap-2">
          <SubmitButton loading={busy} className="w-full sm:w-auto">
            Save
          </SubmitButton>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            disabled={busy}
            className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}