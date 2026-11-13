import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import {
  INVITATION_STATE_MESSAGE,
  invitationPath,
  normalizeToken,
  resolveInvitationState,
} from '@/src/lib/invitations'
import { loadInvitationByToken } from '@/src/lib/invitation-lookup'
import JoinLeagueButton from './join-button'
import { Sparkles, Users, Calendar, XCircle } from 'lucide-react'

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
 *
 * Reads go over PostgREST (src/lib/db.ts) with raw column names, and the old
 * INNER JOIN on leagues is now a second lookup in loadInvitationByToken — a
 * link whose league was deleted still renders as a dead link, as before.
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

  const lookup = await loadInvitationByToken(token)
  if (!lookup || !lookup.league) {
    return <DeadLinkCard message="This invite link isn’t valid." />
  }

  const { invitation: record, league } = lookup
  const leagueId = league.id
  const leagueName = league.name

  const state = resolveInvitationState(record)
  if (state !== 'active') {
    return <DeadLinkCard message={INVITATION_STATE_MESSAGE[state]} />
  }
  // resolveInvitationState already reported 'expired' for a null expiry, so this
  // only narrows the type for the formatter below.
  if (!record.expiresAt) {
    return <DeadLinkCard message={INVITATION_STATE_MESSAGE.expired} />
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
  // A read failure is treated as "not a member", which only ever shows the
  // Join button — redeemInvitation is idempotent, so that is a safe direction
  // to be wrong in.
  const { data: membership, error: membershipError } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error('invite page membership check failed:', membershipError)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            The Commissioner
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're invited!
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
              <Users className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                League invite
              </p>
              <h1 className="text-3xl font-bold text-foreground">
                {leagueName}
              </h1>
            </div>
          </div>

          {membership ? (
            <>
              <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <p className="font-medium text-green-800 dark:text-green-300">
                  You're already a member of this league.
                </p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                  You can access the league dashboard below.
                </p>
              </div>
              <Link
                href={`/leagues/${leagueId}`}
                className="block w-full rounded-lg bg-primary px-4 py-3 text-center text-base font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to your league
              </Link>
            </>
          ) : (
            <>
              <p className="mb-4 text-lg text-foreground">
                You've been invited to join{' '}
                <span className="font-bold text-foreground">
                  {leagueName}
                </span>
                . Joining adds you as a member.
              </p>
              <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                This link expires {dateTimeFormat.format(record.expiresAt)}.
              </p>
              <div className="mb-6">
                <JoinLeagueButton token={token} leagueName={leagueName} />
              </div>
              <p className="text-sm text-muted-foreground">
                Signed in as{' '}
                <span className="font-medium">{session.user.email ?? session.user.id}</span>
              </p>
            </>
          )}
        </div>

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

function DeadLinkCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-destructive">
            <XCircle className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            The Commissioner
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Invite link problem
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Can't open this invite
          </h2>
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="font-medium text-destructive">{message}</p>
            <p className="mt-1 text-sm text-destructive/90">
              Ask your commissioner for a fresh link.
            </p>
          </div>
          <Link
            href="/"
            className="block w-full rounded-lg border border-input bg-transparent px-4 py-3 text-center text-base font-medium text-foreground hover:border-ring/50"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}