'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createLeague } from '@/app/actions/leagues'
import { SPORT_OPTIONS, FORMAT_OPTIONS } from '@/src/lib/league-options'

export default function LeagueCreationForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createLeague(formData)
    setLoading(false)

    if (result.error || !result.leagueId) {
      setError(result.error ?? 'Something went wrong.')
      return
    }

    router.push(`/leagues/${result.leagueId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-black dark:text-zinc-50"
        >
          League name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          minLength={2}
          maxLength={80}
          placeholder="Sunday Bloodbath"
          required
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label
          htmlFor="sport"
          className="block text-sm font-medium text-black dark:text-zinc-50"
        >
          Sport
        </label>
        <select
          id="sport"
          name="sport"
          defaultValue="football"
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
        >
          {SPORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="format"
          className="block text-sm font-medium text-black dark:text-zinc-50"
        >
          Format
        </label>
        <select
          id="format"
          name="format"
          defaultValue="redraft"
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {loading ? 'Creating…' : 'Create League'}
      </button>
    </form>
  )
}
