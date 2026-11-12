'use client'

import { useActionState } from 'react'
import {
  removeLeagueMember,
  type RemoveMemberResult,
} from '@/app/actions/members'

// useActionState invokes actions as (prevState, formData); the server
// action itself only takes formData. Forward explicitly.
async function removeAction(
  _prevState: RemoveMemberResult | undefined,
  formData: FormData,
): Promise<RemoveMemberResult> {
  return removeLeagueMember(formData)
}

/**
 * Per-row "Remove" control on the member directory (Phase 1 / T4).
 * Renders only for the commissioner (server action re-checks).
 */
export default function RemoveMemberButton({
  leagueId,
  memberId,
  memberName,
}: {
  leagueId: string
  memberId: string
  memberName: string
}) {
  const [state, formAction, pending] = useActionState(removeAction, undefined)

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="memberId" value={memberId} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove ${memberName}`}
          className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </form>
      {state?.error && (
        <p className="max-w-[14rem] text-right text-xs text-red-500">
          {state.error}
        </p>
      )}
    </div>
  )
}
