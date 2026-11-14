'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { extractInviteToken } from '@/src/lib/invitations'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * "Have an invite link?" box on the authenticated home (Phase 1 / T5).
 *
 * Deliberately navigates to the public /invite/[token] page instead of
 * redeeming here: that page already owns the validity states, the signed-out
 * round trip to /login?next=..., and the "you're already a member" card, and
 * T3's action refuses to run without a session.
 *
 * A bad paste is a field-level failure, so it renders in the field's error
 * slot (and highlights the input) rather than as a banner.
 */
export default function RedeemInviteForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = extractInviteToken(value)
    if (!token) {
      setError('That does not look like one of our invite links.')
      return
    }

    setError('')
    router.push(`/invite/${token}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Field
        label="Have an invite link?"
        htmlFor="invite-link"
        error={error || null}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-link"
            name="invite"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste an invite link or code"
            className="flex-1"
            aria-invalid={error ? true : undefined}
          />
          <SubmitButton className="w-full shrink-0 sm:w-auto">
            Open invite
          </SubmitButton>
        </div>
      </Field>
    </form>
  )
}
