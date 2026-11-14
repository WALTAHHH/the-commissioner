'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Trash2,
  X,
  Check,
  Pin,
  PinOff,
  Megaphone,
} from 'lucide-react'
import {
  updateAnnouncement,
  deleteAnnouncement,
  markRead,
} from '@/app/actions/announcements'
import type { AnnouncementView } from '@/src/lib/announcements'
import MarkdownBody from '@/src/components/markdown-body'
import { formatDate } from '@/src/lib/display'
import { cn } from 'cn'

/**
 * One announcement in the list (Announcements-2).
 *
 * Visual states, in priority order:
 *  - Pinned → amber card with a Pinned badge; these are sorted to the top
 *    by the page query, not by CSS.
 *  - Unread → a blue "New" dot next to the title and a Mark as read
 *    affordance; read state is per-viewer (announcement_reads) so two
 *    members see two different cards.
 *
 * Commissioner controls: inline Edit (title/body/pin — same swap pattern as
 * RuleCard, no modal library), one-tap Pin/Unpin, and Delete with a two-step
 * confirm. All writes go through app/actions/announcements.ts, which
 * re-checks commissioner_id server-side; router.refresh() re-runs the page
 * query afterwards.
 */
export default function AnnouncementCard({
  announcement,
  isCommissioner,
}: {
  announcement: AnnouncementView
  isCommissioner: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [title, setTitle] = useState(announcement.title)
  const [body, setBody] = useState(announcement.body)
  const [pinned, setPinned] = useState(announcement.isPinned)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function enterEdit() {
    setTitle(announcement.title)
    setBody(announcement.body)
    setPinned(announcement.isPinned)
    setError(null)
    setConfirmingDelete(false)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
  }

  function save() {
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
      const result = await updateAnnouncement(announcement.id, {
        title: title.trim(),
        body,
        isPinned: pinned,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function togglePin() {
    setError(null)
    startTransition(async () => {
      const result = await updateAnnouncement(announcement.id, {
        isPinned: !announcement.isPinned,
      })
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteAnnouncement(announcement.id)
      if (result.error) {
        setError(result.error)
        setConfirmingDelete(false)
        return
      }
      router.refresh()
    })
  }

  function markAsRead() {
    setError(null)
    startTransition(async () => {
      const result = await markRead(announcement.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <article
      className={cn(
        'rounded-2xl border p-5 sm:p-6',
        announcement.isPinned
          ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700/60 dark:bg-amber-900/20'
          : 'border-border bg-card',
      )}
    >
      {/* Title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {announcement.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
            {!announcement.isRead && (
              <span
                data-testid="unread-indicator"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                New
              </span>
            )}
          </div>
          <h3
            className={cn(
              'mt-2 text-lg font-semibold tracking-tight text-foreground',
              !announcement.isRead && 'font-bold',
            )}
          >
            {announcement.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {announcement.authorName} ·{' '}
            {formatDate(new Date(announcement.createdAt))}
            {announcement.updatedAt !== announcement.createdAt && (
              <> · edited {formatDate(new Date(announcement.updatedAt))}</>
            )}
          </p>
        </div>

        {/* Commissioner controls (read mode only) */}
        {isCommissioner && !editing && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePin}
              disabled={pending}
              aria-label={
                announcement.isPinned
                  ? `Unpin announcement ${announcement.title}`
                  : `Pin announcement ${announcement.title}`
              }
              title={announcement.isPinned ? 'Unpin' : 'Pin'}
              className="inline-flex items-center rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {announcement.isPinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={enterEdit}
              className="inline-flex items-center rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </button>
            {confirmingDelete ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="inline-flex items-center rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={pending}
                  className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cancel delete</span>
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete announcement ${announcement.title}`}
                className="inline-flex items-center rounded-lg border border-destructive/40 bg-transparent px-3 py-1.5 text-sm font-medium text-destructive hover:border-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        )}

        {/* Read affordance — every viewer, including the commissioner, has
            their own announcement_reads row. */}
        {!announcement.isRead && !editing && (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={markAsRead}
              disabled={pending}
              className="inline-flex items-center rounded-lg border border-primary/40 bg-transparent px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Check className="mr-1.5 h-4 w-4" />
              Mark as read
            </button>
          </div>
        )}
      </div>

      {/* Body: read mode or inline edit */}
      {editing ? (
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor={`announcement-title-${announcement.id}`}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Title
            </label>
            <input
              id={`announcement-title-${announcement.id}`}
              type="text"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={`announcement-body-${announcement.id}`}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Body{' '}
              <span className="font-normal text-muted-foreground">
                (markdown supported)
              </span>
            </label>
            <textarea
              id={`announcement-body-${announcement.id}`}
              value={body}
              rows={8}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Pin to top
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="mr-1.5 h-4 w-4" />
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <MarkdownBody source={announcement.body} className="mt-4" />
      )}

      {!editing && error && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}
    </article>
  )
}

/** Unused in the card body but keeps the icon import honest for the list's
 *  pinned section header if styling needs a megaphone glyph later. */
export function PinnedSectionLabel() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
      <Megaphone className="h-4 w-4" />
      Pinned
    </span>
  )
}
