'use client'

import { useState } from 'react'
import { createInvitation } from '@/app/actions/invitations'
import { Copy, CheckCircle, Loader } from 'lucide-react'

type State =
  | { status: 'ready' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'created'; url: string; shareUrl: string }

/**
 * Per-row "Invite" control on a placeholder member (migration 0010).
 *
 * Creates an invite link PRE-LINKED to this slot (invitations.
 * placeholder_member_id): whoever redeems it settles the slot — claiming the
 * row in place, or merging its history into their existing membership — so
 * the reserved seat and its recordkeeping land on the real account.
 *
 * commissioner-only is enforced in createInvitation itself; the directory
 * additionally only renders this button for the commissioner.
 */
export default function InviteSlotButton({
  leagueId,
  memberId,
  slotName,
}: {
  leagueId: string
  memberId: string
  slotName: string
}) {
  const [state, setState] = useState<State>({ status: 'ready' })
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setState({ status: 'loading' })
    const result = await createInvitation(leagueId, { placeholderMemberId: memberId })
    if (result.error) {
      setState({ status: 'error', error: result.error })
      return
    }
    setState({ status: 'created', url: result.url!, shareUrl: result.shareUrl! })
  }

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard fails on some environments; fall back to select-and-copy.
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (state.status === 'created') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <p className="max-w-[16rem] truncate text-xs text-muted-foreground" title={state.shareUrl}>
          {state.url}
        </p>
        <button
          type="button"
          onClick={() => handleCopy(state.shareUrl)}
          className="inline-flex items-center rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? (
            <CheckCircle className="mr-1.5 h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleCreate}
        disabled={state.status === 'loading'}
        aria-label={`Create invite link for ${slotName}`}
        className="inline-flex items-center rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
      >
        {state.status === 'loading' ? (
          <>
            <Loader className="mr-2 h-4 w-4 animate-spin" />
            Creating…
          </>
        ) : (
          <>
            <Copy className="mr-2 h-4 w-4" />
            Invite
          </>
        )}
      </button>
      {state.status === 'error' && (
        <p className="max-w-[14rem] text-right text-xs text-destructive">{state.error}</p>
      )}
    </div>
  )
}
