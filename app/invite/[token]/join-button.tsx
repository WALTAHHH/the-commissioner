'use client'

import { useState } from 'react'
import Link from 'next/link'
import { redeemInvitation } from '@/app/actions/invitations'

type JoinedState = {
  leagueId: string
  leagueName: string
  alreadyMember: boolean
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
    })
  }

  if (joined) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
        <p className="font-medium text-green-800 dark:text-green-300">
          {joined.alreadyMember
            ? `You were already a member of ${joined.leagueName}.`
            : `You’re in. Welcome to ${joined.leagueName}.`}
        </p>
        <Link
          href={`/leagues/${joined.leagueId}`}
          className="mt-3 inline-block rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          Go to your league
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        className="w-full rounded bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Joining…' : 'Join League'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
