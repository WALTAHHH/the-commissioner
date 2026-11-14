'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pin } from 'lucide-react'
import { createAnnouncement } from '@/app/actions/announcements'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * Create-announcement form (Announcements-2). Submit calls the
 * createAnnouncement server action with the positional-args contract from
 * the spec, then navigates back to the list, where the new announcement
 * appears (pinned first if it was pinned).
 *
 * Local validation errors land in the offending field's error slot; server
 * failures render as one banner after the fields.
 */
type FieldKey = 'title' | 'body'

interface FormError {
  message: string
  field?: FieldKey
}

export default function AnnouncementForm({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setError({ message: 'Title is required.', field: 'title' })
      return
    }
    if (!body.trim()) {
      setError({ message: 'Body cannot be empty.', field: 'body' })
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
        setError({ message: result.error })
        return
      }
      router.push(`/leagues/${leagueId}/announcements`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-8"
    >
      <Field
        label="Title"
        htmlFor="announcement-title"
        hint="One line members see in the feed."
        error={fieldError('title')}
      >
        <Input
          id="announcement-title"
          type="text"
          value={title}
          maxLength={200}
          required
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline moved to Tuesday"
          aria-invalid={fieldError('title') ? true : undefined}
        />
      </Field>

      <Field
        label="Body"
        htmlFor="announcement-body"
        hint="Markdown supported."
        error={fieldError('body')}
      >
        <Textarea
          id="announcement-body"
          value={body}
          rows={10}
          required
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            'League, quick update.\n\n- Waiver wire now runs at **1 PM ET**\n- Playoff seeding frozen in Week 14\n\nReply in the group chat with questions.'
          }
          className="font-mono leading-relaxed"
          aria-invalid={fieldError('body') ? true : undefined}
        />
      </Field>

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
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-[var(--primary)]"
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

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <SubmitButton loading={pending}>Post announcement</SubmitButton>
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/leagues/${leagueId}/announcements`)}
        >
          Cancel
        </SubmitButton>
      </div>
    </form>
  )
}
