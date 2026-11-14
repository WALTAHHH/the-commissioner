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

        <details className="rounded-lg border border-border bg-muted/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            How do I find these?
          </summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>Log into ESPN Fantasy in your browser.</li>
            <li>Open DevTools (<kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">F12</kbd> or <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">Cmd+Option+I</kbd>).</li>
            <li>Go to Application → Cookies → <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">https://www.espn.com</code>.</li>
            <li>Find <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">espn_s2</code> — it&apos;s a long alphanumeric string.</li>
            <li>Find <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">SWID</code> — it looks like <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}'}</code> with curly braces.</li>
            <li>Copy and paste each value into the fields above.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            These cookies expire when you log out of ESPN. You may need to
            update them each season.
          </p>
        </details>

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