import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, CornerDownLeft } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { formatDate, pluralizeCount } from '@/src/lib/display'
import {
  searchLeague,
  groupResults,
  normalizeQuery,
  isSearchableQuery,
  SEARCH_MIN_QUERY_LENGTH,
} from '@/src/lib/search'


export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `Search ${ctx.name} — The Commissioner` : 'League not found',
  }
}

/**
 * League-scoped search (Search-1).
 *
 * One page, one query box: `?q=` is searched across every text-bearing record
 * in the league (announcements, rules, governance, history, finances) by
 * `searchLeague`, then grouped into fixed sections. Access is the standard
 * league gate — `loadLeagueContext` returns null for a non-member and we 404
 * rather than confirm the league exists; the read layer additionally filters
 * every table by `league_id`, so no cross-league row can leak.
 *
 * The form is a plain GET form (no client JS): submitting reloads the page
 * with `?q=`, which keeps the whole feature server-rendered and shareable as a
 * URL — the same shape the member directory's search box uses.
 */
export default async function LeagueSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const sp = await searchParams
  const rawQ = sp.q
  const query = normalizeQuery(typeof rawQ === 'string' ? rawQ : undefined)
  // Only run the query once it clears the minimum length; below that we show
  // the empty state (with a hint) instead of matching the whole league.
  const ranSearch = isSearchableQuery(query)
  const results = ranSearch ? await searchLeague(id, query) : []
  const groups = groupResults(results)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Search
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Search announcements, rules, governance, history and finances in{' '}
          {ctx.name}.
        </p>
      </div>

      {/* GET form — no client JS, shareable URLs. */}
      <form action={`/leagues/${id}/search`} method="get" role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Search this league…"
            aria-label="Search this league"
            className="w-full rounded-lg border border-input bg-transparent py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {!ranSearch ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Search className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            {query.length > 0 ? 'Keep typing' : 'Search the league record'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.length > 0
              ? `Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search.`
              : 'Find any announcement, rule, poll, decision, dispute, season recap, obligation or prize by keyword.'}
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-foreground">No matches</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing in {ctx.name} matches “{query}”. Try a different keyword.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-muted-foreground">
            {pluralizeCount(results.length, 'result')} for “{query}”
          </p>
          {groups.map(({ group, results: groupItems }) => (
            <section key={group} aria-label={group} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </h2>
              <ul className="space-y-2">
                {groupItems.map((result) => (
                  <li key={`${result.type}:${result.id}`}>
                    <Link
                      href={result.href}
                      className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-ring/50 hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {result.label}
                        </span>
                        {result.timestamp && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(new Date(result.timestamp))}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 font-medium text-foreground">
                        {result.title}
                      </h3>
                      {result.snippet && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {result.snippet}
                        </p>
                      )}
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary">
                        <CornerDownLeft className="h-3 w-3" aria-hidden />
                        Open
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
