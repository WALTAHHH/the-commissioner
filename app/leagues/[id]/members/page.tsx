import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, listActiveMembers } from '@/src/lib/dashboard'
import { displayName, prettifyLabel, formatDate, pluralizeCount } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import RemoveMemberButton from './remove-member-button'
import InviteMemberButton from '../invite-member-button'
import RoleBadge from '@/src/components/role-badge'
import { Users, UserPlus, ArrowLeft } from 'lucide-react'

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
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Member directory
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {pluralizeCount(members.length, 'active member')}
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Invite member
            </Link>
          )}
        </div>
      </div>

      {/* Invite box for commissioner */}
      {ctx.isCommissioner && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-900/20">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-900 dark:text-blue-300">
            <UserPlus className="h-5 w-5" />
            Invite new members
          </h3>
          <p className="mb-4 text-sm text-blue-800 dark:text-blue-400">
            Create a shareable invite link (7‑day default, unlimited uses)
          </p>
          <InviteMemberButton leagueId={id} />
        </div>
      )}

      {/* Members list */}
      {members.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            No members yet
          </h3>
          <p className="mt-2 text-muted-foreground">
            Invite members to join this league.
          </p>
          {ctx.isCommissioner && (
            <div className="mt-6">
              <InviteMemberButton leagueId={id} />
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-foreground">
                      {displayName(m)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <RoleBadge role={m.role} />
                      <span className="text-xs text-muted-foreground">
                        Joined {formatDate(m.joinedAt)}
                      </span>
                    </div>
                  </div>
                </div>
                {ctx.isCommissioner && m.role !== 'commissioner' && (
                  <div className="mt-4 sm:mt-0">
                    <RemoveMemberButton
                      leagueId={id}
                      memberId={m.id}
                      memberName={displayName(m)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Back link */}
      <div className="pt-6 border-t border-border">
        <Link
          href={`/leagues/${id}`}
          className="inline-flex items-center text-sm font-medium text-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to league dashboard
        </Link>
      </div>
    </div>
  )
}