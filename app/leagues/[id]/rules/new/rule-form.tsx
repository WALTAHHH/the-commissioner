'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Link2Off } from 'lucide-react'
import { createRule } from '@/app/actions/rules'

/**
 * Create-rule form (Rules-2). Submit calls the createRule server action with
 * positional args — the contract Rules-1 shipped — then navigates back to
 * the rulebook, where the freshly-inserted rule appears.
 *
 * Category is optional; leaving it blank files the rule under "Uncategorized".
 */
export default function RuleForm({
  leagueId,
  categories,
}: {
  leagueId: string
  categories: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hasCategories = categories.length > 0

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
      const result = await createRule(leagueId, {
        title: title.trim(),
        body,
        categoryId: categoryId || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/rules`)
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
          htmlFor="rule-title"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Title
        </label>
        <input
          id="rule-title"
          type="text"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline"
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Category (optional) */}
      <div>
        <label
          htmlFor="rule-category"
          className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          Category
          <span className="inline-flex items-center text-xs font-normal text-muted-foreground">
            {hasCategories ? (
              <>
                <Link2 className="mr-1 h-3 w-3" /> optional
              </>
            ) : (
              <>
                <Link2Off className="mr-1 h-3 w-3" /> no categories in this league yet
              </>
            )}
          </span>
        </label>
        <select
          id="rule-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!hasCategories}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Body */}
      <div>
        <label
          htmlFor="rule-body"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Body{' '}
          <span className="font-normal text-muted-foreground">
            (markdown supported)
          </span>
        </label>
        <textarea
          id="rule-body"
          value={body}
          rows={10}
          required
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Trades must be completed by **Week 9**.\n\n- Both managers must agree\n- No trades after the playoff lock'}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
          {pending ? 'Creating…' : 'Create rule'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/leagues/${leagueId}/rules`)}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
