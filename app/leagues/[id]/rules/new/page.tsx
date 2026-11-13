import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadRuleCategories } from '@/src/lib/rules'
import { isUuid } from '@/src/lib/invitations'
import { ArrowLeft } from 'lucide-react'
import RuleForm from './rule-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `New rule — The Commissioner` }
}

/**
 * Create-rule page (Rules-2). Commissioner-only entry point: members who
 * navigate here directly are sent back to the rulebook, and `createRule`
 * server-side re-checks authorization regardless.
 */
export default async function NewRulePage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/rules`)

  const categories = await loadRuleCategories(id)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href={`/leagues/${id}/rules`}
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to rulebook
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          New rule
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a rule to {ctx.name}&apos;s rulebook. It starts as a draft.
        </p>
      </div>

      <RuleForm leagueId={id} categories={categories} />
    </div>
  )
}
