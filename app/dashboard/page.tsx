import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { listUserLeagues } from '@/src/lib/dashboard'
import { displayName, prettifyLabel, pluralizeCount } from '@/src/lib/display'
import RedeemInviteForm from '@/src/components/redeem-invite-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Your leagues — The Commissioner',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const leagues = await listUserLeagues(user.id)

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-black dark:text-zinc-50 sm:text-3xl">
            Your leagues
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Logged in as: {user.email}
          </p>
        </div>
        <Link
          href="/leagues/new"
          className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Create a league
        </Link>
      </div>

      {leagues.length === 0 ? (
        // Empty state — same width and feel as the invite box
        <div className="rounded-lg border border-zinc-300 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            Welcome to The Commissioner
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Create your own fantasy league or join an existing one with an
            invite link.
          </p>
          <div className="mt-6 flex flex-col gap-6">
            <div>
              <h3 className="mb-2 text-sm font-medium text-black dark:text-zinc-50">
                Create a league
              </h3>
              <Link
                href="/leagues/new"
                className="inline-flex items-center rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                Start a league
              </Link>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-black dark:text-zinc-50">
                Have an invite link?
              </h3>
              <RedeemInviteForm />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <div
              key={league.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold leading-6 text-black dark:text-zinc-50">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {league.name}
                  </Link>
                </h2>
                {league.isCommissioner && (
                  <span className="inline-flex items-center rounded-full border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800 dark:border-blue-800 dark:text-blue-300">
                    Commissioner
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {prettifyLabel(league.sport)} · {prettifyLabel(league.format)}
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                {pluralizeCount(league.memberCount, 'member')}
              </p>
              <div className="mt-4 flex gap-3">
                <Link
                  href={`/leagues/${league.id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Open dashboard
                </Link>
                <Link
                  href={`/leagues/${league.id}/members`}
                  className="text-sm font-medium text-zinc-700 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-300"
                >
                  Members
                </Link>
                <Link
                  href={`/leagues/${league.id}/settings`}
                  className="text-sm font-medium text-zinc-700 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-300"
                >
                  Settings
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {leagues.length > 0 && (
        <div className="mt-12 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">
            Join another league
          </h3>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            If you have an invite link, paste it below to join the league as a
            member.
          </p>
          <RedeemInviteForm />
        </div>
      )}
    </div>
  )
}