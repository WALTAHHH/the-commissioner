'use client'

import { useActionState } from 'react'
import {
  removeLeagueMember,
  type RemoveMemberResult,
} from '@/app/actions/members'
import { Trash2 } from 'lucide-react'

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
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="memberId" value={memberId} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove ${memberName}`}
          className="inline-flex items-center rounded-lg border border-destructive/40 bg-transparent px-4 py-2 text-sm font-medium text-destructive hover:border-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </form>
      {state?.error && (
        <p className="max-w-[14rem] text-right text-xs text-destructive">
          {state.error}
        </p>
      )}
    </div>
  )
}