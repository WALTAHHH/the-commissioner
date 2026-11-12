import { db } from '@/src/lib/db'
import { leagues } from '@/src/db/schema/leagues'
import { leagueMembers } from '@/src/db/schema/members'
import { authUsers } from '@/src/db/schema/auth'
import { and, asc, eq, sql } from 'drizzle-orm'
import { createClient } from '@/src/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RemoveMemberButton from './remove-member-button'

export const dynamic = 'force-dynamic'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function prettifyRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// auth.users.raw_user_meta_data is GoTrue's JSONB bag; prefer an explicit
// display name over the email (signup does not collect a name yet, so
// email is the usual fallback).
function displayName(row: {
  email: string | null
  fullName: string | null
  name: string | null
  nickname: string | null
}): string {
  return (
    row.fullName ?? row.name ?? row.nickname ?? row.email ?? 'Unknown member'
  )
}

export default async function LeagueMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const [league] = await db
    .select({
      name: leagues.name,
      commissionerId: leagues.commissionerId,
    })
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1)

  if (!league) {
    notFound()
  }

  // Access control: active members of this league only (the commissioner's
  // own membership row also satisfies this; the commissionerId fallback
  // covers leagues created before membership rows existed).
  const [viewer] = await db
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, id),
        eq(leagueMembers.userId, session.user.id),
        eq(leagueMembers.status, 'active'),
      ),
    )
    .limit(1)

  const isCommissioner =
    league.commissionerId === session.user.id || viewer?.role === 'commissioner'

  if (!viewer && !isCommissioner) {
    // Non-members get 404, not 403 — do not confirm the league exists.
    notFound()
  }

  const members = await db
    .select({
      id: leagueMembers.id,
      role: leagueMembers.role,
      teamName: leagueMembers.teamName,
      joinedAt: leagueMembers.joinedAt,
      email: authUsers.email,
      fullName: sql<string | null>`${authUsers.rawUserMetaData} ->> 'full_name'`,
      name: sql<string | null>`${authUsers.rawUserMetaData} ->> 'name'`,
      nickname: sql<string | null>`${authUsers.rawUserMetaData} ->> 'nickname'`,
    })
    .from(leagueMembers)
    .innerJoin(authUsers, eq(leagueMembers.userId, authUsers.id))
    .where(
      and(
        eq(leagueMembers.leagueId, id),
        eq(leagueMembers.status, 'active'),
      ),
    )
    .orderBy(asc(leagueMembers.joinedAt))

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col py-16 px-8 sm:px-16 bg-white dark:bg-black">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-semibold leading-8 tracking-tight text-black dark:text-zinc-50">
            {league.name}
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {members.length} active {members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Member directory
        </p>

        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-black dark:text-zinc-50">
                  {displayName(m)}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium dark:border-zinc-700">
                    {prettifyRole(m.role)}
                  </span>
                  <span className="ml-2">Joined {formatDate(m.joinedAt)}</span>
                </p>
              </div>
              {isCommissioner && m.role !== 'commissioner' && (
                <RemoveMemberButton
                  leagueId={id}
                  memberId={m.id}
                  memberName={displayName(m)}
                />
              )}
            </li>
          ))}
        </ul>

        {members.length === 0 && (
          <p className="mt-8 text-zinc-600 dark:text-zinc-400">
            No active members.
          </p>
        )}

        <div className="mt-12">
          <a
            href={`/leagues/${id}`}
            className="text-sm text-black underline dark:text-zinc-50"
          >
            ← Back to league
          </a>
        </div>
      </main>
    </div>
  )
}
