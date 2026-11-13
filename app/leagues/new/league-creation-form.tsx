'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createLeague } from '@/app/actions/leagues'
import { SPORT_OPTIONS, FORMAT_OPTIONS } from '@/src/lib/league-options'
import { Trophy, Users, Hash } from 'lucide-react'

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Hash className="h-4 w-4" />
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
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <div>
        <label
          htmlFor="sport"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Trophy className="h-4 w-4" />
          Sport
        </label>
        <select
          id="sport"
          name="sport"
          defaultValue="football"
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
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
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Users className="h-4 w-4" />
          Format
        </label>
        <select
          id="format"
          name="format"
          defaultValue="redraft"
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create League'}
      </button>
    </form>
  )
}