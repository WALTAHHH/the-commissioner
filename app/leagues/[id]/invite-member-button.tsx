'use client'

import { useState } from 'react'
import { createInvitation } from '@/app/actions/invitations'
import Link from 'next/link'
import { Copy, CheckCircle, Loader } from 'lucide-react'

type InviteResult =
  | { status: 'ready' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'created'; token: string; url: string; shareUrl: string; expiresAt: string }

/**
 * "Invite Member" call-to-action for the league dashboard (commissioner only).
 *
 * Renders a button that, when clicked, calls createInvitation (Phase 1 / T3)
 * and then shows a shareable URL with a copy button and a direct link to the
 * invite page.
 *
 * The UI is deliberately tolerant of the missing NEXT_PUBLIC_SITE_URL environment
 * variable (origin unknown). In that situation the absolute URL is the same as
 * the relative one, and the copy button still works with the in-app path.
 */
export default function InviteMemberButton({ leagueId }: { leagueId: string }) {
  const [state, setState] = useState<InviteResult>({ status: 'ready' })
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setState({ status: 'loading' })
    const result = await createInvitation(leagueId)
    if (result.error) {
      setState({ status: 'error', error: result.error })
      return
    }
    setState({
      status: 'created',
      token: result.token!,
      url: result.url!,
      shareUrl: result.shareUrl!,
      expiresAt: result.expiresAt!,
    })
  }

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard fails on some environments; fall back to an input.select
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

  return (
    <div className="space-y-6">
      {state.status === 'ready' || state.status === 'loading' ? (
        <button
          onClick={handleCreate}
          disabled={state.status === 'loading'}
          className="inline-flex items-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
        >
          {state.status === 'loading' ? (
            <>
              <Loader className="mr-3 h-5 w-5 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Create invite link
            </>
          )}
        </button>
      ) : state.status === 'error' ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">
            Could not create an invite link
          </p>
          <p className="mt-2 text-sm text-destructive/90">
            {state.error}
          </p>
          <button
            onClick={() => setState({ status: 'ready' })}
            className="mt-4 text-sm font-medium text-destructive underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Invite link created
              </h3>
              <p className="text-sm text-muted-foreground">
                Share this link with your league members.
              </p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-medium text-foreground">
            Invite link
          </label>
          <div className="mb-4 flex gap-2">
            <input
              readOnly
              value={state.shareUrl.startsWith('/') ? new URL(state.shareUrl, window.location.origin).href : state.shareUrl}
              className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => handleCopy(state.shareUrl.startsWith('/') ? new URL(state.shareUrl, window.location.origin).href : state.shareUrl)}
              className="inline-flex items-center rounded-lg border border-input bg-transparent px-4 py-3 text-sm font-medium text-foreground hover:border-ring/50"
            >
              {copied ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="mb-6 text-xs text-muted-foreground">
            This link expires{' '}
            {new Date(state.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
            {state.shareUrl.startsWith('/') && ' This is an in‑app link — share it with league members.'}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={state.url}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open invite page
            </Link>
            <button
              type="button"
              onClick={() => setState({ status: 'ready' })}
              className="text-sm font-medium text-foreground hover:text-foreground"
            >
              Create another link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}