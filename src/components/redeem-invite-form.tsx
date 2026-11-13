'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { extractInviteToken } from '@/src/lib/invitations'

/**
 * "Have an invite link?" box on the authenticated home (Phase 1 / T5).
 *
 * Deliberately navigates to the public /invite/[token] page instead of
 * redeeming here: that page already owns the validity states, the signed-out
 * round trip to /login?next=..., and the "you're already a member" card, and
 * T3's action refuses to run without a session.
 */
export default function RedeemInviteForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = extractInviteToken(value)
    if (!token) {
      setError('That does not look like one of our invite links.')
      return
    }

    setError('')
    router.push(`/invite/${token}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label
        htmlFor="invite-link"
        className="block text-sm font-medium text-foreground"
      >
        Have an invite link?
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="invite-link"
          name="invite"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste an invite link or code"
          className="w-full min-w-0 flex-1 rounded border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open invite
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  )
}
