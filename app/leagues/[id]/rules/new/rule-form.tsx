'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Link2Off } from 'lucide-react'
import { createRule } from '@/app/actions/rules'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * Create-rule form (Rules-2). Submit calls the createRule server action with
 * positional args — the contract Rules-1 shipped — then navigates back to
 * the rulebook, where the freshly-inserted rule appears.
 *
 * Category is optional; leaving it blank files the rule under "Uncategorized".
 *
 * Error placement follows the form pattern: local validation for a specific
 * field renders in that field's error slot; everything else (server-side
 * failures) renders as one banner after the fields.
 */
type FieldKey = 'title' | 'body'

interface FormError {
  message: string
  /** undefined → whole-form banner instead of a per-field error */
  field?: FieldKey
}

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
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const hasCategories = categories.length > 0
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
      const result = await createRule(leagueId, {
        title: title.trim(),
        body,
        categoryId: categoryId || undefined,
      })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      router.push(`/leagues/${leagueId}/rules`)
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
        htmlFor="rule-title"
        hint="Shown in the rulebook list — keep it short."
        error={fieldError('title')}
      >
        <Input
          id="rule-title"
          type="text"
          value={title}
          maxLength={200}
          required
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Trade deadline"
          aria-invalid={fieldError('title') ? true : undefined}
        />
      </Field>

      <Field
        label={
          <>
            Category{' '}
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
          </>
        }
        htmlFor="rule-category"
        hint="Leave as “Uncategorized” to file without one."
      >
        <Select
          id="rule-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!hasCategories || pending}
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Body"
        htmlFor="rule-body"
        hint="Markdown supported."
        error={fieldError('body')}
      >
        <Textarea
          id="rule-body"
          value={body}
          rows={10}
          required
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Trades must be completed by **Week 9**.\n\n- Both managers must agree\n- No trades after the playoff lock'}
          className="font-mono leading-relaxed"
          aria-invalid={fieldError('body') ? true : undefined}
        />
      </Field>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <SubmitButton loading={pending}>Create rule</SubmitButton>
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/leagues/${leagueId}/rules`)}
        >
          Cancel
        </SubmitButton>
      </div>
    </form>
  )
}
