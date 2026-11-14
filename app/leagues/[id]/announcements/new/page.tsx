import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { ArrowLeft } from 'lucide-react'
import AnnouncementForm from './announcement-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `New announcement — The Commissioner` }
}

/**
 * Create-announcement page (Announcements-2). Commissioner-only entry
 * point: members who navigate here directly are sent back to the list, and
 * `createAnnouncement` server-side re-checks commissioner_id regardless.
 */
export default async function NewAnnouncementPage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/announcements`)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href={`/leagues/${id}/announcements`}
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to announcements
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          New announcement
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Broadcast a message to everyone in {ctx.name}. Pin it to keep it at
          the top of the list.
        </p>
      </div>

      <AnnouncementForm leagueId={id} />
    </div>
  )
}
