import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, listActiveMembers } from '@/src/lib/dashboard'
import { displayName, prettifyLabel, formatDate, pluralizeCount } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import RemoveMemberButton from './remove-member-button'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} members — The Commissioner` : 'League not found',
  }
}

export default async function LeagueMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!isUuid(id)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const members = await listActiveMembers(id)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-black dark:text-zinc-50 sm:text-3xl">
            {ctx.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Member directory
          </p>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {pluralizeCount(members.length, 'active member')}
        </p>
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border border-zinc-300 bg-white p-6 text-center text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No active members yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-base font-medium text-black dark:text-zinc-50">
                  {displayName(m)}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium dark:border-zinc-700">
                    {prettifyLabel(m.role)}
                  </span>
                  <span className="ml-2">
                    Joined {formatDate(m.joinedAt)}
                  </span>
                </p>
              </div>
              {ctx.isCommissioner && m.role !== 'commissioner' && (
                <RemoveMemberButton
                  leagueId={id}
                  memberId={m.id}
                  memberName={displayName(m)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <Link
          href={`/leagues/${id}`}
          className="text-sm font-medium text-zinc-700 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          ← Back to league
        </Link>
      </div>
    </div>
  )
}