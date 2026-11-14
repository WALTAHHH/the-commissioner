'use client'

import { useActionState } from 'react'
import {
  createPlaceholderMember,
  type CreatePlaceholderResult,
} from '@/app/actions/members'
import { Field } from '@/components/ui/field'
import { FormMessage, FormSuccess } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'

/**
 * Roles a reserved seat may carry. Mirrors PLACEHOLDER_ROLES in
 * app/actions/members.ts (which is the enforcement point): 'commissioner'
 * is excluded because leagues.commissioner_id is the source of truth for
 * ownership and must never be impersonated by a slot.
 */
const SLOT_ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'co_commissioner', label: 'Co-commissioner' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'guest', label: 'Guest' },
]

async function placeholderAction(
  _prev: CreatePlaceholderResult | undefined,
  formData: FormData,
): Promise<CreatePlaceholderResult> {
  const str = (key: string): string | null => {
    const v = formData.get(key)
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  return createPlaceholderMember(formData.get('leagueId') as string, {
    displayName: str('displayName') ?? '',
    teamName: str('teamName'),
    role: str('role'),
    email: str('email'),
    notes: str('notes'),
  })
}

/**
 * "Add placeholder" tab of the add-member page (migration 0010).
 *
 * Reserves a roster slot for someone without an account yet. The slot
 * carries the display name (required) and optionally a team, an intended
 * role, an email gate, and a note. Creating one revalidates the directory;
 * success copy points at the next step (Invite on the row) rather than
 * redirecting, so the commissioner can batch-add a whole roster.
 */
export default function AddPlaceholderForm({
  leagueId,
  className,
}: {
  leagueId: string
  className?: string
}) {
  const [state, formAction, pending] = useActionState(placeholderAction, undefined)

  return (
    <form action={formAction} className={cn('space-y-5', className)}>
      <input type="hidden" name="leagueId" value={leagueId} />

      <Field
        label="Display name"
        htmlFor="placeholder-display-name"
        hint="Shown in the directory until this person signs up and claims the seat."
      >
        <Input
          id="placeholder-display-name"
          name="displayName"
          required
          maxLength={120}
          placeholder="e.g. Rashad Aliev"
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Team name" htmlFor="placeholder-team-name" hint="Optional.">
          <Input
            id="placeholder-team-name"
            name="teamName"
            maxLength={120}
            placeholder="e.g. Baku Blaze"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Role"
          htmlFor="placeholder-role"
          hint="What they'll take over when they claim the seat."
        >
          <Select id="placeholder-role" name="role" defaultValue="member">
            {SLOT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Email"
        htmlFor="placeholder-email"
        hint="Optional. If set, only a user signed up with this address can claim the seat."
      >
        <Input
          id="placeholder-email"
          name="email"
          type="email"
          maxLength={320}
          placeholder="they@example.com"
          autoComplete="off"
        />
      </Field>

      <Field label="Notes" htmlFor="placeholder-notes" hint="Optional. For you and your co-commissioners.">
        <Textarea
          id="placeholder-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="e.g. Replacing Dario next season — joins in March."
        />
      </Field>

      {state?.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state?.memberId ? (
        <FormSuccess>
          Placeholder added — it now shows as Pending in the directory. Use Invite on the row to
          send them a link that claims this exact seat.
        </FormSuccess>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton loading={pending}>Add placeholder</SubmitButton>
        {pending ? (
          <span className="text-sm text-muted-foreground">Saving…</span>
        ) : null}
      </div>
    </form>
  )
}
