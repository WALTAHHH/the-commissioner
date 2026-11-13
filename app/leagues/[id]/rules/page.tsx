import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadRulebook } from '@/src/lib/rules'
import { isUuid } from '@/src/lib/invitations'
import { pluralizeCount } from '@/src/lib/display'
import RuleCard from './rule-card'
import { BookOpen, Plus, ScrollText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} rules — The Commissioner` : 'League not found',
  }
}

/**
 * League rulebook (Rules-2): every non-deleted rule grouped by category,
 * markdown bodies rendered, version history inline. Commissioner gets
 * Add/Edit/Delete controls; members get the read view.
 *
 * Access: identical gate to every league page — loadLeagueContext returns
 * null for non-members/non-commissioners and we 404 rather than 403.
 */
export default async function LeagueRulesPage({
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

  const groups = await loadRulebook(id)
  const ruleCount = groups.reduce((total, group) => total + group.rules.length, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            League rulebook
            {ruleCount > 0 && (
              <> · {pluralizeCount(ruleCount, 'rule')}</>
            )}
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/rules/new`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add rule
          </Link>
        )}
      </div>

      {/* Empty state */}
      {ruleCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ScrollText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            No rules yet. Add your first rule.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The rulebook keeps season agreements in one place — scoring,
            trade windows, payouts.
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}/rules/new`}
              className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add your first rule
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`rule-group-${group.id}`}>
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h2
                  id={`rule-group-${group.id}`}
                  className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {group.name}
                </h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {group.rules.length}
                </span>
              </div>
              {group.rules.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No rules in this category yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {group.rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      isCommissioner={ctx.isCommissioner}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
