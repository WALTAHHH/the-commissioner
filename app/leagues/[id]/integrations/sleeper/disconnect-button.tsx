'use client'

import { useState } from 'react'
import { disconnectIntegration } from '@/app/actions/integrations'
import { Unplug } from 'lucide-react'

/**
 * "Disconnect" (Sleeper-2): sets the connection's status to 'disconnected'.
 * Destructive enough to confirm — sync history and the row itself stay, and
 * reconnecting through the form reactivates them.
 */
export default function DisconnectButton({ connectionId }: { connectionId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    if (busy) return
    if (!window.confirm('Disconnect this Sleeper league? Sync history is kept and you can reconnect any time.')) {
      return
    }
    setBusy(true)
    setError('')

    const result = await disconnectIntegration(connectionId)
    setBusy(false)

    if (result?.error) {
      setError(result.error)
    }
    // Success re-renders the page (via the action's revalidatePath) into the
    // connect form; no local cleanup needed.
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-lg border border-destructive/40 bg-transparent px-4 py-2 text-sm font-medium text-destructive transition-colors hover:border-destructive hover:bg-destructive/10 disabled:opacity-50 sm:w-auto"
      >
        <Unplug className="mr-2 h-4 w-4" />
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
