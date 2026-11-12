import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  loadLeagueContext,
  countActiveMembers,
  listActiveMembers,
  resolveSeason,
} from '@/src/lib/dashboard'
import { displayName, prettifyLabel, formatDate, pluralizeCount } from '@/src/lib/display'
import {
  MEMBER_PREVIEW_LIMIT,
  type SeasonSource,
} from '@/src/lib/dashboard'
import InviteMemberButton from './invite-member-button'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} — The Commissioner` : 'League not found',
  }
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) {
    redirect('/login')
  }

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const [memberCount, members, season] = await Promise.all([
    countActiveMembers(id),
    listActiveMembers(id, MEMBER_PREVIEW_LIMIT),
    resolveSeason(id),
  ])

  const seasonLabel = (src: SeasonSource, year: number) => {
    if (src === 'current') return `Season ${year}` // row flagged is_current
    if (src === 'latest') return `Season ${year} (most recent)`
    return `Season ${year} (no season recorded yet)`
  }

  const isCommissioner = ctx.isCommissioner

  return (
    <div className="space-y-8">
      {/* League header */}
      <div>
        <h1 className="text-2xl font-semibold leading-tight text-black dark:text-zinc-50 sm:text-3xl">
          {ctx.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {prettifyLabel(ctx.sport)} · {prettifyLabel(ctx.format)}
        </p>
      </div>

      {/* Stats / overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Active members</p>
          <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
            {memberCount}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Season</p>
          <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
            {season.seasonYear}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
            {seasonLabel(season.source, season.seasonYear)}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-zinc-300 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
          Quick actions
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {isCommissioner && (
              <div>
                <p className="text-sm font-medium text-black dark:text-zinc-50">
                  Invite a member
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Create a shareable invite link (7‑day default, unlimited uses)
                </p>
                <div className="mt-2">
                  <InviteMemberButton leagueId={id} />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Link
                href={`/leagues/${id}/members`}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              >
                View all members
              </Link>
              <Link
                href={`/leagues/${id}/settings`}
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              >
                League settings
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Member preview */}
      <div className="rounded-lg border border-zinc-300 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Members
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {pluralizeCount(memberCount, 'member')}
          </p>
        </div>
        {members.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No active members yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-black dark:text-zinc-50">
                      {displayName(member)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="inline-flex items-center rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium dark:border-zinc-700">
                        {prettifyLabel(member.role)}
                      </span>
                      <span className="ml-2">Joined {formatDate(member.joinedAt)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {memberCount > members.length && (
              <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                <Link
                  href={`/leagues/${id}/members`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  View all {memberCount} {memberCount === 1 ? 'member' : 'members'} →
                </Link>
              </p>
            )}
          </>
        )}
      </div>

      {/* Integrations placeholder */}
      <div className="rounded-lg border border-zinc-300 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-black dark:text-zinc-50">
          Integrations
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          No integrations connected — imports from third‑party fantasy platforms
          will land in a later phase.
        </p>
      </div>
    </div>
  )
}