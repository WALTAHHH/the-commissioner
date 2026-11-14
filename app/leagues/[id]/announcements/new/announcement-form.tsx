'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pin } from 'lucide-react'
import { createAnnouncement } from '@/app/actions/announcements'

/**
 * Create-announcement form (Announcements-2). Submit calls the
 * createAnnouncement server action with the positional-args contract from
 * the spec, then navigates back to the list, where the new announcement
 * appears (pinned first if it was pinned).
 */
export default function AnnouncementForm({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!body.trim()) {
      setError('Body cannot be empty.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createAnnouncement(leagueId, {
        title: title.trim(),
        body,
        isPinned,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/announcements`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8"
    >
      {/* Title */}
      <div>
        <label
          htmlFor="announcement-title"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Title
        </label>
        <input
          id="announcement-title"
          type="text"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline moved to Tuesday"
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Body */}
      <div>
        <label
          htmlFor="announcement-body"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Body{' '}
          <span className="font-normal text-muted-foreground">
            (markdown supported)
          </span>
        </label>
        <textarea
          id="announcement-body"
          value={body}
          rows={10}
          required
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            'League, quick update.\n\n- Waiver wire now runs at **1 PM ET**\n- Playoff seeding frozen in Week 14\n\nReply in the group chat with questions.'
          }
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Pin toggle */}
      <label
        htmlFor="announcement-pin"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3"
      >
        <input
          id="announcement-pin"
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Pin className="h-3.5 w-3.5" />
            Pin this announcement
          </span>
          <span className="mt-0.5 block text-muted-foreground">
            Pinned announcements stay at the top of the list until unpinned.
          </span>
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Posting…' : 'Post announcement'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/leagues/${leagueId}/announcements`)}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
