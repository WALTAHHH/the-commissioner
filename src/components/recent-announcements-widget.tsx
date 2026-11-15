import Link from 'next/link'
import { Megaphone, Pin, Inbox } from 'lucide-react'
import type { AnnouncementCrossLeagueView } from '@/src/lib/announcements'
import { formatRelativeTime } from '@/src/lib/display'
import LeagueBadge from '@/src/components/league-badge'

/**
 * "Recent announcements" widget on /dashboard.
 *
 * Server component, presentation only — the data comes from
 * loadRecentAnnouncementsAcrossLeagues (src/lib/announcements.ts), which has
 * already applied the viewer's league-access rule and per-league read state.
 * Nothing here is interactive: unlike the league announcements page there is
 * no inline mark-read/edit; each item deep-links to that league's
 * announcements list where the full cards live.
 *
 * Body text is rendered as a plain one-line snippet, not markdown: a widget
 * row is a preview, and MarkdownBody (react-markdown) would pull the whole
 * renderer into the dashboard for content we truncate to one line anyway.
 *
 * Each row leads with a LeagueBadge naming the league the announcement came
 * from — with several leagues feeding one feed, that origin is the single
 * most important thing a row has to communicate.
 */

/** Characters of body text kept for the snippet preview. */
const SNIPPET_LENGTH = 120

/**
 * Strip the handful of markdown constructs that show up in real bodies
 * (heading/list/blockquote markers, emphasis and link wrappers) so the
 * snippet never renders raw syntax. Deliberately conservative — it is a
 * truncation helper, not a parser; anything it misses is still plain text.
 */
export function announcementSnippet(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s{1,}|\d+\.\s{1,})\s*/gm, '') // block markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/\s+/g, ' ') // collapse newlines/runs
    .trim()

  if (plain.length <= SNIPPET_LENGTH) return plain
  // Back off to a word boundary so the snippet never cuts mid-word.
  const cut = plain.slice(0, SNIPPET_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : SNIPPET_LENGTH).trimEnd()}…`
}

export default function RecentAnnouncementsWidget({
  announcements,
}: {
  announcements: AnnouncementCrossLeagueView[]
}) {
  return (
    <section
      aria-labelledby="recent-announcements-heading"
      className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="mb-5 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" aria-hidden />
        <h2
          id="recent-announcements-heading"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Recent announcements
        </h2>
      </div>

      {announcements.length === 0 ? (
        <div
          data-testid="recent-announcements-empty"
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center"
        >
          <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No announcements yet — broadcasts from your commissioners will
            appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {announcements.map((announcement) => (
            <li
              key={`${announcement.leagueId}:${announcement.id}`}
              className="py-4 first:pt-0 last:pb-0"
            >
              <Link
                href={`/leagues/${announcement.leagueId}/announcements`}
                className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {/* Which league this came from — the widget is cross-league,
                      so this is the one thing every row must make obvious. */}
                  <LeagueBadge name={announcement.leagueName} />
                  {!announcement.isRead && (
                    <span
                      data-testid="unread-indicator"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      New
                    </span>
                  )}
                  {announcement.isPinned && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-warning">
                      <Pin className="h-3 w-3" aria-hidden />
                      Pinned
                    </span>
                  )}
                </div>
                <h3
                  className={
                    announcement.isRead
                      ? 'mt-1.5 text-base font-medium text-foreground group-hover:text-primary'
                      : 'mt-1.5 text-base font-semibold text-foreground group-hover:text-primary'
                  }
                >
                  {announcement.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {announcementSnippet(announcement.body)}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {announcement.authorName} ·{' '}
                  {formatRelativeTime(new Date(announcement.createdAt))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
