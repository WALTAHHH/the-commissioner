'use client'

import { useState } from 'react'
import { triggerSync } from '@/app/actions/integrations'
import { RefreshCw, Check } from 'lucide-react'

/**
 * "Sync now" (Sleeper-2): calls triggerSync, which runs syncSleeperLeague
 * server-side (API fetch + sync log + last_synced_at) and revalidates this
 * page. The fresh timestamp arrives through the server re-render; locally we
 * only show pending / success-check / error state.
 */
export default function SyncNowButton({ connectionId }: { connectionId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)

    const result = await triggerSync(connectionId)
    setBusy(false)

    if (result?.error) {
      setMessage({ kind: 'error', text: result.error })
    } else {
      setMessage({ kind: 'ok', text: 'Sync complete.' })
      setTimeout(() => setMessage((m) => (m?.kind === 'ok' ? null : m)), 5000)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
      {message && (
        <p
          role="status"
          className={`flex items-center gap-1.5 text-xs ${
            message.kind === 'ok' ? 'text-success' : 'text-destructive'
          }`}
        >
          {message.kind === 'ok' && <Check className="h-3.5 w-3.5" />}
          {message.text}
        </p>
      )}
    </div>
  )
}
