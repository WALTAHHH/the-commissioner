/**
 * Read queries backing the rulebook pages (Rules-2).
 *
 * Server-only. Everything here is a read — writes live in `app/actions/rules.ts`
 * (createRule/updateRule/deleteRule/getRuleHistory are the action-layer
 * contract; the pages fetch through this helper instead because the current
 * `authorize()` stub denies every action call, including reads, until the
 * permission-model workstream lands. Page access is gated by
 * `loadLeagueContext` exactly like the dashboard/members/settings pages).
 *
 * Queries go over HTTPS to PostgREST via the service-role client in
 * `src/lib/db.ts`: raw column names (`league_id`, `category_id`), mapped to
 * camelCase view types at the boundary.
 */

import { db } from '@/src/lib/db'
import type {
  RuleCategoryRow,
  RuleRow,
  RuleVersionRow,
} from '@/src/db/rows'

export type RuleVersionView = {
  id: string
  body: string
  changedBy: string
  changedAt: string
}

export type RuleView = {
  id: string
  title: string
  body: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
  /** Append-only history, oldest first. Empty when the initial version insert failed. */
  versions: RuleVersionView[]
}

export type RuleGroupView = {
  id: string
  name: string
  displayOrder: number
  rules: RuleView[]
}

/** Synthetic bucket id for rules whose `category_id` is null. */
export const UNCATEGORIZED_ID = 'uncategorized'

/**
 * The league's rulebook: every non-deleted rule grouped by category.
 *
 * Categories sort by `display_order`; rules inside a group sort by
 * `created_at` (same ordering the `getRules` action contract produces).
 * Uncategorized rules append as a final "Uncategorized" group only when
 * at least one exists, so the empty league renders a true empty state.
 */
export async function loadRulebook(leagueId: string): Promise<RuleGroupView[]> {
  const [categoriesRes, rulesRes] = await Promise.all([
    db
      .from('rule_categories')
      .select('id, league_id, name, display_order, created_at')
      .eq('league_id', leagueId)
      .order('display_order', { ascending: true }),
    db
      .from('rules')
      .select('id, league_id, category_id, title, body, is_published, created_by, created_at, updated_at, deleted_at')
      .eq('league_id', leagueId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  if (categoriesRes.error) {
    console.error('loadRulebook categories error:', categoriesRes.error)
  }
  if (rulesRes.error) {
    console.error('loadRulebook rules error:', rulesRes.error)
  }

  const categories = (categoriesRes.data ?? []) as RuleCategoryRow[]
  const ruleRows = (rulesRes.data ?? []) as RuleRow[]
  if (ruleRows.length === 0) return []

  // One versions query for the whole rulebook, attached per rule afterwards.
  const { data: versionsData, error: versionsError } = await db
    .from('rule_versions')
    .select('id, rule_id, body, changed_by, changed_at')
    .in('rule_id', ruleRows.map((r) => r.id))
    .order('changed_at', { ascending: true })

  if (versionsError) {
    console.error('loadRulebook versions error:', versionsError)
  }
  const versionsByRule = new Map<string, RuleVersionView[]>()
  for (const v of (versionsData ?? []) as RuleVersionRow[]) {
    const list = versionsByRule.get(v.rule_id) ?? []
    list.push({ id: v.id, body: v.body, changedBy: v.changed_by, changedAt: v.changed_at })
    versionsByRule.set(v.rule_id, list)
  }

  const toView = (rule: RuleRow): RuleView => ({
    id: rule.id,
    title: rule.title,
    body: rule.body,
    isPublished: rule.is_published,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
    versions: versionsByRule.get(rule.id) ?? [],
  })

  const grouped: RuleGroupView[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    displayOrder: cat.display_order,
    rules: ruleRows.filter((r) => r.category_id === cat.id).map(toView),
  }))

  const uncategorized = ruleRows.filter((r) => !r.category_id)
  if (uncategorized.length > 0) {
    grouped.push({
      id: UNCATEGORIZED_ID,
      name: 'Uncategorized',
      displayOrder: Number.MAX_SAFE_INTEGER,
      rules: uncategorized.map(toView),
    })
  }

  return grouped
}

/**
 * The league's categories for the create-rule form's optional select.
 */
export async function loadRuleCategories(
  leagueId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await db
    .from('rule_categories')
    .select('id, league_id, name, display_order, created_at')
    .eq('league_id', leagueId)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('loadRuleCategories error:', error)
    return []
  }
  return ((data ?? []) as RuleCategoryRow[]).map((c) => ({ id: c.id, name: c.name }))
}
