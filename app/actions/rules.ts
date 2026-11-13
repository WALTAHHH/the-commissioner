'use server'

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { authorize } from '@/src/lib/auth/authorize'
import { recordActivity } from '@/src/lib/activity'
import type {
  RuleRow,
  RuleCategoryRow,
  RuleVersionRow,
} from '@/src/db/rows'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str)
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

async function requireCommissioner(userId: string, leagueId: string): Promise<boolean> {
  const { data, error } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error || !data) return false
  return (data as unknown as { commissioner_id: string }).commissioner_id === userId
}

export interface CreateRuleResult {
  ruleId?: string
  error?: string
}

export interface UpdateRuleResult {
  ruleId?: string
  error?: string
}

export interface DeleteRuleResult {
  ruleId?: string
  error?: string
}

export interface GetRulesResult {
  categories?: Array<{
    id: string
    name: string
    displayOrder: number
    rules: Array<{
      id: string
      title: string
      body: string
      isPublished: boolean
      createdBy: string
      createdAt: string
      updatedAt: string
    }>
  }>
  error?: string
}

export interface GetRuleHistoryResult {
  versions?: Array<{
    id: string
    body: string
    changedBy: string
    changedAt: string
  }>
  error?: string
}

/**
 * Create a rule (draft) and its initial version.
 *
 * @param leagueId uuid of the league
 * @param title rule title
 * @param body rule content
 * @param categoryId optional category uuid
 */
export async function createRule(
  leagueId: string,
  { title, body, categoryId }: { title: string; body: string; categoryId?: string }
): Promise<CreateRuleResult> {
  // 1. Authentication
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  // 2. Input validation
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (categoryId && !isUuid(categoryId)) {
    return { error: 'Invalid category ID.' }
  }
  if (!title.trim() || title.length > 200) {
    return { error: 'Title must be between 1 and 200 characters.' }
  }
  if (!body.trim()) {
    return { error: 'Body cannot be empty.' }
  }

  // 3. Authorization
  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createRule',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create rules in this league.' }
  }

  // 4. Insert rule
  const { data: ruleData, error: ruleError } = await db
    .from('rules')
    .insert({
      league_id: leagueId,
      category_id: categoryId || null,
      title: title.trim(),
      body: body.trim(),
      is_published: false,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (ruleError) {
    console.error('createRule insert error:', ruleError)
    return { error: 'Failed to create rule.' }
  }

  const ruleId = ruleData.id

  // 5. Insert initial version
  const { error: versionError } = await db
    .from('rule_versions')
    .insert({
      rule_id: ruleId,
      body: body.trim(),
      changed_by: user.id,
    })

  if (versionError) {
    console.error('createRule version insert error:', versionError)
    // Attempt to rollback rule? We'll leave it; it's okay to have rule without version.
  }

  await recordActivity(
    leagueId,
    user.id,
    'rule_created',
    `Rule created: “${title.trim()}”`,
    { ruleId, categoryId: categoryId || null },
  )

  return { ruleId }
}

/**
 * Update a rule's title and/or body, appending a version if body changed.
 *
 * @param ruleId uuid of the rule
 * @param title optional new title
 * @param body optional new body
 */
export async function updateRule(
  ruleId: string,
  { title, body }: { title?: string; body?: string }
): Promise<UpdateRuleResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(ruleId)) {
    return { error: 'Invalid rule ID.' }
  }
  if (title !== undefined && (!title.trim() || title.length > 200)) {
    return { error: 'Title must be between 1 and 200 characters.' }
  }
  if (body !== undefined && !body.trim()) {
    return { error: 'Body cannot be empty.' }
  }

  // Fetch rule to get league_id and check authorization (title feeds the
  // audit-event description when the caller changed only the body).
  const { data: ruleData, error: fetchError } = await db
    .from('rules')
    .select('league_id, deleted_at, title')
    .eq('id', ruleId)
    .maybeSingle()

  if (fetchError || !ruleData) {
    return { error: 'Rule not found.' }
  }
  if ((ruleData as unknown as { deleted_at: string | null }).deleted_at) {
    return { error: 'Cannot update a deleted rule.' }
  }

  const leagueId = (ruleData as unknown as { league_id: string }).league_id

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'updateRule',
    resourceId: ruleId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to update this rule.' }
  }

  const updates: any = {}
  if (title !== undefined) updates.title = title.trim()
  if (body !== undefined) updates.body = body.trim()
  updates.updated_at = new Date().toISOString()

  const { error: updateError } = await db
    .from('rules')
    .update(updates)
    .eq('id', ruleId)

  if (updateError) {
    console.error('updateRule error:', updateError)
    return { error: 'Failed to update rule.' }
  }

  // If body changed, append a version
  if (body !== undefined) {
    const { error: versionError } = await db
      .from('rule_versions')
      .insert({
        rule_id: ruleId,
        body: body.trim(),
        changed_by: user.id,
      })

    if (versionError) {
      console.error('updateRule version insert error:', versionError)
    }
  }

  const existingTitle = (ruleData as unknown as { title?: string }).title ?? ''
  const displayTitle = (title ?? existingTitle).trim() || 'Untitled rule'
  await recordActivity(
    leagueId,
    user.id,
    'rule_updated',
    `Rule updated: “${displayTitle}”`,
    { ruleId, bodyChanged: body !== undefined },
  )

  return { ruleId }
}

/**
 * Soft delete a rule (set deleted_at).
 *
 * @param ruleId uuid of the rule
 */
export async function deleteRule(ruleId: string): Promise<DeleteRuleResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(ruleId)) {
    return { error: 'Invalid rule ID.' }
  }

  const { data: ruleData, error: fetchError } = await db
    .from('rules')
    .select('league_id, deleted_at, title')
    .eq('id', ruleId)
    .maybeSingle()

  if (fetchError || !ruleData) {
    return { error: 'Rule not found.' }
  }
  if ((ruleData as unknown as { deleted_at: string | null }).deleted_at) {
    return { ruleId } // already deleted
  }

  const leagueId = (ruleData as unknown as { league_id: string }).league_id

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'deleteRule',
    resourceId: ruleId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to delete this rule.' }
  }

  const { error: updateError } = await db
    .from('rules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', ruleId)

  if (updateError) {
    console.error('deleteRule error:', updateError)
    return { error: 'Failed to delete rule.' }
  }

  const deletedTitle =
    (ruleData as unknown as { title?: string }).title?.trim() || 'Untitled rule'
  await recordActivity(
    leagueId,
    user.id,
    'rule_deleted',
    `Rule deleted: “${deletedTitle}”`,
    { ruleId },
  )

  return { ruleId }
}

/**
 * Fetch all published and draft rules for a league, grouped by category.
 *
 * @param leagueId uuid of the league
 */
export async function getRules(leagueId: string): Promise<GetRulesResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewRules',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view rules in this league.' }
  }

  // Fetch categories for this league
  const { data: categoriesData, error: categoriesError } = await db
    .from('rule_categories')
    .select('id, name, display_order')
    .eq('league_id', leagueId)
    .order('display_order')

  if (categoriesError) {
    console.error('getRules categories error:', categoriesError)
    return { error: 'Failed to fetch categories.' }
  }

  // Fetch rules for this league (excluding deleted)
  const { data: rulesData, error: rulesError } = await db
    .from('rules')
    .select('*')
    .eq('league_id', leagueId)
    .is('deleted_at', null)
    .order('created_at')

  if (rulesError) {
    console.error('getRules rules error:', rulesError)
    return { error: 'Failed to fetch rules.' }
  }

  const categories = categoriesData.map((cat) => ({
    id: cat.id,
    name: cat.name,
    displayOrder: cat.display_order,
    rules: rulesData
      .filter((rule) => rule.category_id === cat.id)
      .map((rule) => ({
        id: rule.id,
        title: rule.title,
        body: rule.body,
        isPublished: rule.is_published,
        createdBy: rule.created_by,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      })),
  }))

  // Rules without a category (category_id null)
  const uncategorizedRules = rulesData.filter((rule) => !rule.category_id)
  if (uncategorizedRules.length > 0) {
    categories.push({
      id: 'uncategorized',
      name: 'Uncategorized',
      displayOrder: 9999,
      rules: uncategorizedRules.map((rule) => ({
        id: rule.id,
        title: rule.title,
        body: rule.body,
        isPublished: rule.is_published,
        createdBy: rule.created_by,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      })),
    })
  }

  return { categories }
}

/**
 * Fetch all versions of a rule, oldest first.
 *
 * @param ruleId uuid of the rule
 */
export async function getRuleHistory(ruleId: string): Promise<GetRuleHistoryResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(ruleId)) {
    return { error: 'Invalid rule ID.' }
  }

  // Fetch rule to get league_id for authorization
  const { data: ruleData, error: fetchError } = await db
    .from('rules')
    .select('league_id')
    .eq('id', ruleId)
    .maybeSingle()

  if (fetchError || !ruleData) {
    return { error: 'Rule not found.' }
  }

  const leagueId = (ruleData as unknown as { league_id: string }).league_id

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewRuleHistory',
    resourceId: ruleId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view this rule\'s history.' }
  }

  const { data: versionsData, error: versionsError } = await db
    .from('rule_versions')
    .select('id, body, changed_by, changed_at')
    .eq('rule_id', ruleId)
    .order('changed_at', { ascending: true })

  if (versionsError) {
    console.error('getRuleHistory error:', versionsError)
    return { error: 'Failed to fetch rule history.' }
  }

  const versions = versionsData.map((v) => ({
    id: v.id,
    body: v.body,
    changedBy: v.changed_by,
    changedAt: v.changed_at,
  }))

  return { versions }
}