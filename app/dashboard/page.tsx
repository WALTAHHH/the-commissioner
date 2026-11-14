import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { listUserLeagues } from '@/src/lib/dashboard'
import { prettifyLabel, pluralizeCount } from '@/src/lib/display'
import RoleBadge from '@/src/components/role-badge'
import RedeemInviteForm from '@/src/components/redeem-invite-form'
import { Sparkles, Plus, Users, Trophy } from 'lucide-react'

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
      {/* Header */}
      <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your leagues
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Standings, money, rules and votes — one home per league.
          </p>
        </div>
        <Link
          href="/leagues/new"
          className="inline-flex items-center rounded-full bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-5 w-5" />
          Create a league
        </Link>
      </div>

      {leagues.length === 0 ? (
        // Empty state — welcoming and actionable
        <div className="rounded-2xl border border-border bg-card p-10 shadow-sm max-w-2xl">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Trophy className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Welcome to The Commissioner
              </h2>
              <p className="mt-1 text-muted-foreground">
                Create your own fantasy league or join an existing one with an invite link.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 font-semibold text-foreground">Create a league</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Start a new league and invite friends.
              </p>
              <Link
                href="/leagues/new"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start a league
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 font-semibold text-foreground">Join a league</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Have an invite link? Paste it below.
              </p>
              <RedeemInviteForm />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* League cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold leading-6 text-foreground">
                      <Link
                        href={`/leagues/${league.id}`}
                        className="hover:text-primary"
                      >
                        {league.name}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {prettifyLabel(league.sport)} · {prettifyLabel(league.format)}
                    </p>
                  </div>
                  <RoleBadge
                    role={league.isCommissioner ? 'commissioner' : league.role ?? 'member'}
                  />
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{pluralizeCount(league.memberCount, 'member')}</span>
                </div>
                <div className="mt-6 flex gap-3">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open dashboard
                  </Link>
                  <Link
                    href={`/leagues/${league.id}/members`}
                    className="flex-1 rounded-lg border border-input bg-transparent px-4 py-2 text-center text-sm font-medium text-foreground hover:border-ring/50"
                  >
                    Members
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Invite box */}
          <div className="mt-12 rounded-2xl border border-border bg-card p-8">
            <h3 className="mb-3 flex items-center gap-2 text-xl font-semibold text-foreground">
              <Sparkles className="h-5 w-5" />
              Join another league
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              If you have an invite link, paste it below to join the league as a
              member.
            </p>
            <RedeemInviteForm />
          </div>
        </>
      )}
    </div>
  )
}