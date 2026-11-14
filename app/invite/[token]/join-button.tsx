'use client'

import { useState } from 'react'
import Link from 'next/link'
import { redeemInvitation } from '@/app/actions/invitations'
import { CheckCircle, Loader } from 'lucide-react'

type JoinedState = {
  leagueId: string
  leagueName: string
  alreadyMember: boolean
  /** What happened to a placeholder seat linked to this invite, if any. */
  note?: string
}

export default function JoinLeagueButton({
  token,
  leagueName,
}: {
  token: string
  leagueName: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<JoinedState | null>(null)

  const handleJoin = async () => {
    setError('')
    setLoading(true)

    const result = await redeemInvitation(token)
    setLoading(false)

    if (result.error || !result.ok || !result.leagueId) {
      setError(result.error ?? 'Could not join the league. Please try again.')
      return
    }

    setJoined({
      leagueId: result.leagueId,
      leagueName: result.leagueName ?? leagueName,
      alreadyMember: result.alreadyMember === true,
      note: result.note,
    })
  }

  if (joined) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/10 p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-6 w-6 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-success">
              {joined.alreadyMember
                ? `You were already a member of ${joined.leagueName}.`
                : `You're in. Welcome to ${joined.leagueName}.`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {joined.note ?? 'You can now access the league dashboard.'}
            </p>
          </div>
        </div>
        <Link
          href={`/leagues/${joined.leagueId}`}
          className="block w-full rounded-lg bg-primary px-4 py-3 text-center text-base font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to your league
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader className="mr-3 h-5 w-5 animate-spin" />
            Joining…
          </>
        ) : (
          'Join League'
        )}
      </button>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Could not join</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      )}
    </div>
  )
}