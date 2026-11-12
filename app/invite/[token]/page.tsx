import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/src/lib/db'
import { invitations } from '@/src/db/schema/invitations'
import { leagues } from '@/src/db/schema/leagues'
import { leagueMembers } from '@/src/db/schema/members'
import { createClient } from '@/src/utils/supabase/server'
import {
  INVITATION_STATE_MESSAGE,
  invitationPath,
  normalizeToken,
  resolveInvitationState,
} from '@/src/lib/invitations'
import JoinLeagueButton from './join-button'

export const dynamic = 'force-dynamic'

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Public invite link (Phase 1 / T3).
 *
 * Anonymous visitors can see whether a link is alive; joining itself needs an
 * account, so a valid link + no session redirects to /login with the invite
 * path preserved in ?next=.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: rawToken } = await params

  // A malformed segment is treated exactly like an unknown token: one dead-link
  // card, no uuid cast that would throw inside Postgres.
  const token = normalizeToken(rawToken)
  if (!token) {
    return <DeadLinkCard message="This invite link isn’t valid." />
  }

  const [record] = await db
    .select({
      leagueId: invitations.leagueId,
      leagueName: leagues.name,
      expiresAt: invitations.expiresAt,
      maxUses: invitations.maxUses,
      useCount: invitations.useCount,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .innerJoin(leagues, eq(leagues.id, invitations.leagueId))
    .where(eq(invitations.token, token))
    .limit(1)

  if (!record) {
    return <DeadLinkCard message="This invite link isn’t valid." />
  }

  const state = resolveInvitationState(record)
  if (state !== 'active') {
    return <DeadLinkCard message={INVITATION_STATE_MESSAGE[state]} />
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(invitationPath(token))}`)
  }

  // Already an ACTIVE member? Then the link has nothing left to do — say so
  // instead of offering a button that silently no-ops. A soft-removed row
  // (T4 status semantics) still shows the button: redeeming re-activates it.
  const [membership] = await db
    .select({ id: leagueMembers.id })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, record.leagueId),
        eq(leagueMembers.userId, session.user.id),
        eq(leagueMembers.status, 'active')
      )
    )
    .limit(1)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          League invite
        </p>
        <h1 className="mt-2 text-2xl font-bold text-black dark:text-zinc-50">
          {record.leagueName}
        </h1>

        {membership ? (
          <>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              You’re already a member of this league.
            </p>
            <Link
              href={`/leagues/${record.leagueId}`}
              className="mt-6 block rounded bg-blue-500 px-4 py-2 text-center text-white hover:bg-blue-600"
            >
              Go to your league
            </Link>
          </>
        ) : (
          <>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              You’ve been invited to join{' '}
              <span className="font-medium text-black dark:text-zinc-50">
                {record.leagueName}
              </span>
              . Joining adds you as a member.
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Signed in as {session.user.email ?? session.user.id}
            </p>
            <div className="mt-6">
              <JoinLeagueButton token={token} leagueName={record.leagueName} />
            </div>
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              This link expires {dateTimeFormat.format(record.expiresAt)}.
              {record.maxUses !== null
                ? ` It can be used ${record.maxUses} time${record.maxUses === 1 ? '' : 's'} (${record.useCount} used).`
                : ''}
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function DeadLinkCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
          Can’t open this invite
        </h1>
        <p className="mt-4 text-red-600 dark:text-red-400">{message}</p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Ask your commissioner for a fresh link.
        </p>
        <Link
          href="/"
          className="mt-6 block rounded bg-zinc-200 px-4 py-2 text-center text-black hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
        >
          Back to home
        </Link>
      </main>
    </div>
  )
}
