import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadAnnouncements } from '@/src/lib/announcements'
import { isUuid } from '@/src/lib/invitations'
import { pluralizeCount } from '@/src/lib/display'
import AnnouncementCard, { PinnedSectionLabel } from './announcement-card'
import { Megaphone, Plus, Inbox } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} announcements — The Commissioner` : 'League not found',
  }
}

/**
 * League announcements (Announcements-2): everything the commissioner has
 * broadcast, pinned first, markdown rendered, with per-viewer read state.
 *
 * Access: identical gate to every league page — loadLeagueContext returns
 * null for non-members/non-commissioners and we 404 rather than 403. The
 * read computation lives in src/lib/announcements (same layering as
 * governance/finances: pages read via the lib, writes go through
 * app/actions/announcements which re-check commissioner_id server-side).
 */
export default async function LeagueAnnouncementsPage({
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

  const announcements = await loadAnnouncements(id, user.id)
  const unreadCount = announcements.filter((a) => !a.isRead).length
  // Pinned section first; the query already orders pinned→newest, so the
  // split just chooses which header each card renders under.
  const pinned = announcements.filter((a) => a.isPinned)
  const latest = announcements.filter((a) => !a.isPinned)
  const renderCard = (a: (typeof announcements)[number]) => (
    <AnnouncementCard
      key={a.id}
      announcement={a}
      isCommissioner={ctx.isCommissioner}
    />
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Announcements
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name}
            {announcements.length > 0 && (
              <> · {pluralizeCount(announcements.length, 'announcement')}</>
            )}
            {unreadCount > 0 && (
              <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/announcements/new`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create announcement
          </Link>
        )}
      </div>

      {/* Empty state */}
      {announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            No announcements yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Broadcasts from the commissioner land here — season news,
            deadline reminders, lineup updates.
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}/announcements/new`}
              className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Megaphone className="mr-2 h-4 w-4" />
              Post your first announcement
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {pinned.length > 0 && (
            <section aria-label="Pinned announcements" className="space-y-4">
              <PinnedSectionLabel />
              {pinned.map(renderCard)}
            </section>
          )}
          {latest.length > 0 && (
            <section aria-label="All announcements" className="space-y-4">
              {pinned.length > 0 && (
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Latest
                </h2>
              )}
              {latest.map(renderCard)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
