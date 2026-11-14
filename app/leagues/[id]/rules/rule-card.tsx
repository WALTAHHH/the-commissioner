'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, History, X, Check } from 'lucide-react'
import { updateRule, deleteRule } from '@/app/actions/rules'
import type { RuleView } from '@/src/lib/rules'
import MarkdownBody from '@/src/components/markdown-body'
import { formatDate } from '@/src/lib/display'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * One rule inside the rulebook (Rules-2).
 *
 * Read mode: markdown body + commissioner-only Edit/Delete controls and a
 * native <details> disclosure for version history (data ships with the page
 * payload — see loadRulebook — so history costs no extra round trip).
 *
 * Edit mode is an inline swap of the card body (no modal library on the
 * dependency list, and a full /edit route would be one more navigation for a
 * two-field form). Writes go through the updateRule/deleteRule server actions
 * — which re-check authorization server-side — then router.refresh() pulls
 * the new state from the page query.
 */
export default function RuleCard({
  rule,
  isCommissioner,
}: {
  rule: RuleView
  isCommissioner: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [title, setTitle] = useState(rule.title)
  const [body, setBody] = useState(rule.body)
  const [error, setError] = useState<{ message: string; field?: 'title' | 'body' } | null>(null)
  const [pending, startTransition] = useTransition()

  const versionCount = rule.versions.length

  function enterEdit() {
    setTitle(rule.title)
    setBody(rule.body)
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
      setError({ message: 'Title is required.', field: 'title' })
      return
    }
    if (!body.trim()) {
      setError({ message: 'Body cannot be empty.', field: 'body' })
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updateRule(rule.id, { title: title.trim(), body })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteRule(rule.id)
      if (result.error) {
        setError({ message: result.error })
        setConfirmingDelete(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      {/* Title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {rule.title}
            </h3>
            {isCommissioner && !rule.isPublished && (
              <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Draft
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Updated {formatDate(new Date(rule.updatedAt))}
          </p>
        </div>

        {isCommissioner && !editing && (
          <div className="flex shrink-0 items-center gap-2">
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
                aria-label={`Delete rule ${rule.title}`}
                className="inline-flex items-center rounded-lg border border-destructive/40 bg-transparent px-3 py-1.5 text-sm font-medium text-destructive hover:border-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body: read mode or inline edit */}
      {editing ? (
        <div className="mt-4 space-y-4">
          <Field
            label="Title"
            htmlFor={`rule-title-${rule.id}`}
            error={error?.field === 'title' ? error.message : null}
          >
            <Input
              id={`rule-title-${rule.id}`}
              type="text"
              value={title}
              maxLength={200}
              disabled={pending}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={error?.field === 'title' ? true : undefined}
            />
          </Field>
          <Field
            label="Body"
            htmlFor={`rule-body-${rule.id}`}
            hint="Markdown supported."
            error={error?.field === 'body' ? error.message : null}
          >
            <Textarea
              id={`rule-body-${rule.id}`}
              value={body}
              rows={8}
              disabled={pending}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono"
              aria-invalid={error?.field === 'body' ? true : undefined}
            />
          </Field>
          {error && !error.field && <FormMessage>{error.message}</FormMessage>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <SubmitButton type="button" loading={pending} onClick={save}>
              Save changes
            </SubmitButton>
            <SubmitButton
              type="button"
              variant="outline"
              disabled={pending}
              onClick={cancelEdit}
            >
              Cancel
            </SubmitButton>
          </div>
        </div>
      ) : (
        <MarkdownBody source={rule.body} className="mt-4" />
      )}

      {!editing && error && <FormMessage className="mt-3">{error.message}</FormMessage>}

      {/* Version history: native disclosure, no extra fetch */}
      {!editing && versionCount > 0 && (
        <details className="group mt-4 border-t border-border pt-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <History className="h-4 w-4" />
            Version history
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
              {versionCount}
            </span>
          </summary>
          <ol className="mt-4 space-y-5">
            {rule.versions.map((version, index) => (
              <li key={version.id} className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Version {index + 1} — {formatDate(new Date(version.changedAt))}
                </p>
                <MarkdownBody
                  source={version.body}
                  className="mt-2 text-sm opacity-90"
                />
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  )
}
