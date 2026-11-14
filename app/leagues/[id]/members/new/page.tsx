import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import AddMemberTabs from './add-member-tabs'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `Add member — ${ctx.name} — The Commissioner` : 'League not found',
  }
}

/**
 * Add-member page (migration 0010): two flows behind tabs — a plain invite
 * link, or a placeholder slot that reserves a roster row (and its future
 * recordkeeping) for someone who has not signed up. Commissioner-only, same
 * 404-not-403 rule as every league page.
 */
export default async function NewMemberPage({
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
  if (!ctx || !ctx.isCommissioner) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Add member
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invite someone with a link, or reserve their seat now as a placeholder and let them
          claim it later.
        </p>
      </div>

      <AddMemberTabs leagueId={id} />

      {/* Back link */}
      <div className="pt-6 border-t border-border">
        <Link
          href={`/leagues/${id}/members`}
          className="inline-flex items-center text-sm font-medium text-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to members
        </Link>
      </div>
    </div>
  )
}
