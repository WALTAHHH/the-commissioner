'use client'

import { useState } from 'react'
import { createInvitation } from '@/app/actions/invitations'
import Link from 'next/link'

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
    } catch {
      // Clipboard fails on some environments; fall back to an input.select
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
  }

  return (
    <div className="space-y-4">
      {state.status === 'ready' || state.status === 'loading' ? (
        <button
          onClick={handleCreate}
          disabled={state.status === 'loading'}
          className="rounded bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {state.status === 'loading' ? 'Creating…' : 'Invite Member'}
        </button>
      ) : state.status === 'error' ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="font-medium text-red-800 dark:text-red-300">
            Could not create an invite link
          </p>
          <p className="mt-1 text-sm text-red  -600 dark:text-red-400">
            {state.error}
          </p>
          <button
            onClick={() => setState({ status: 'ready' })}
            className="mt-3 text-sm text-red-700 underline dark:text-red-300"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <label className="block text-sm font-medium text-black dark:text-zinc-50">
            Invite link
          </label>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={state.shareUrl.startsWith('/') ? new URL(state.shareUrl, window.location.origin).href : state.shareUrl}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => handleCopy(state.shareUrl.startsWith('/') ? new URL(state.shareUrl, window.location.origin).href : state.shareUrl)}
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This link expires {new Date(state.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
            {state.shareUrl.startsWith('/') && ' This is an in‑app link — share it with league members.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Link
              href={state.url}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Open invite page
            </Link>
            <button
              type="button"
              onClick={() => setState({ status: 'ready' })}
              className="text-sm font-medium text-zinc-700 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              Create another link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}