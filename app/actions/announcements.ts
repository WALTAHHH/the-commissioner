'use server'

/**
 * Announcements — commissioners broadcast messages to league members,
 * members read them.
 *
 * Hard rules enforced here:
 *  - Only the league's commissioner (leagues.commissioner_id, the source of
 *    truth — same check invitations/integrations use, because the authorize()
 *    stub denies everything) may create, edit, pin or delete announcements.
 *  - Announcements are isolated per league; mutating an announcement by id
 *    always re-reads its league_id from the DB, never from the client.
 *  - Deletes are soft (`deleted_at`); the row stays for the audit trail.
 *  - markRead is idempotent per (announcement, member): the unique index
 *    (announcement_id, member_id) backs the upsert, so re-marking refreshes
 *    read_at instead of duplicating.
 */

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { recordActivity } from '@/src/lib/activity'
import { loadAnnouncements, loadActiveMemberId } from '@/src/lib/announcements'
import type { AnnouncementView } from '@/src/lib/announcements'

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

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

/** Commissioner-of-the-league check against the leagues row itself. */
async function requireCommissioner(
  userId: string,
  leagueId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error || !data) return false
  return (data as unknown as { commissioner_id: string }).commissioner_id === userId
}

/**
 * Load a live (non-deleted) announcement by id. Returns null for missing or
 * soft-deleted rows — callers surface that as "not found", which also hides
 * announcements in other leagues from id-probing.
 */
async function loadLiveAnnouncement(announcementId: string) {
  const { data, error } = await db
    .from('announcements')
    .select('id, league_id, created_by, title, body, is_pinned, created_at, updated_at, deleted_at')
    .eq('id', announcementId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as { id: string; league_id: string; created_by: string }
}

/** Title/body validation shared by create and update. `undefined` = "not provided" on update. */
function validateFields({
  title,
  body,
}: {
  title?: string
  body?: string
}): string | null {
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return 'Title is required.'
    }
    if (title.length > 200) {
      return 'Title must be at most 200 characters.'
    }
  }
  if (body !== undefined) {
    if (typeof body !== 'string' || !body.trim()) {
      return 'Body cannot be empty.'
    }
    if (body.length > 50000) {
      return 'Body must be at most 50000 characters.'
    }
  }
  return null
}

// ----------------------------------------------------------------------------
// Result interfaces
// ----------------------------------------------------------------------------

export interface CreateAnnouncementResult {
  announcementId?: string
  error?: string
}

export interface UpdateAnnouncementResult {
  announcementId?: string
  error?: string
}

export interface DeleteAnnouncementResult {
  announcementId?: string
  error?: string
}

export interface MarkReadResult {
  readId?: string
  /** True when the member already had a read row (still refreshes read_at). */
  alreadyRead?: boolean
  error?: string
}

export interface GetAnnouncementsResult {
  announcements?: AnnouncementView[]
  error?: string
}

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------

/**
 * Create an announcement for a league. Commissioner only.
 *
 * @param leagueId uuid of the league
 * @param title    1-200 chars
 * @param body     markdown, required, ≤50000 chars
 * @param isPinned optional; default false
 */
export async function createAnnouncement(
  leagueId: string,
  {
    title,
    body,
    isPinned = false,
  }: { title: string; body: string; isPinned?: boolean },
): Promise<CreateAnnouncementResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  const fieldError = validateFields({ title, body })
  if (fieldError) {
    return { error: fieldError }
  }
  if (typeof isPinned !== 'boolean') {
    return { error: 'Pin flag must be a boolean.' }
  }

  if (!(await requireCommissioner(user.id, leagueId))) {
    return { error: 'Only the league commissioner can create announcements.' }
  }

  const { data, error } = await db
    .from('announcements')
    .insert({
      league_id: leagueId,
      created_by: user.id,
      title: title.trim(),
      body: body.trim(),
      is_pinned: isPinned,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('createAnnouncement insert error:', error)
    return { error: 'Failed to create announcement.' }
  }

  const announcementId = (data as unknown as { id: string }).id

  await recordActivity(
    leagueId,
    user.id,
    'announcement_created',
    `Announcement created: ${title.trim()}`,
    { announcementId, isPinned },
  )

  return { announcementId }
}

/**
 * Edit an announcement (title, body and/or pin state). Commissioner of the
 * owning league only. At least one field must be provided.
 *
 * `updated_at` is set explicitly — PostgREST has no trigger for it.
 */
export async function updateAnnouncement(
  announcementId: string,
  {
    title,
    body,
    isPinned,
  }: { title?: string; body?: string; isPinned?: boolean },
): Promise<UpdateAnnouncementResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(announcementId)) {
    return { error: 'Invalid announcement ID.' }
  }
  if (title === undefined && body === undefined && isPinned === undefined) {
    return { error: 'Nothing to update.' }
  }
  const fieldError = validateFields({ title, body })
  if (fieldError) {
    return { error: fieldError }
  }
  if (isPinned !== undefined && typeof isPinned !== 'boolean') {
    return { error: 'Pin flag must be a boolean.' }
  }

  const announcement = await loadLiveAnnouncement(announcementId)
  if (!announcement) {
    return { error: 'Announcement not found.' }
  }

  if (!(await requireCommissioner(user.id, announcement.league_id))) {
    return { error: 'Only the league commissioner can edit announcements.' }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) patch.title = title.trim()
  if (body !== undefined) patch.body = body.trim()
  if (isPinned !== undefined) patch.is_pinned = isPinned

  const { error } = await db
    .from('announcements')
    .update(patch)
    .eq('id', announcementId)

  if (error) {
    console.error('updateAnnouncement error:', error)
    return { error: 'Failed to update announcement.' }
  }

  await recordActivity(
    announcement.league_id,
    user.id,
    'announcement_updated',
    `Announcement updated${title !== undefined ? `: ${title.trim()}` : ''}`,
    { announcementId, fields: Object.keys(patch).filter((k) => k !== 'updated_at') },
  )

  return { announcementId }
}

/**
 * Soft-delete an announcement: sets deleted_at, the row survives for the
 * audit trail and every read path filters it out. Commissioner only.
 */
export async function deleteAnnouncement(
  announcementId: string,
): Promise<DeleteAnnouncementResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(announcementId)) {
    return { error: 'Invalid announcement ID.' }
  }

  const announcement = await loadLiveAnnouncement(announcementId)
  if (!announcement) {
    return { error: 'Announcement not found.' }
  }

  if (!(await requireCommissioner(user.id, announcement.league_id))) {
    return { error: 'Only the league commissioner can delete announcements.' }
  }

  const { error } = await db
    .from('announcements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', announcementId)

  if (error) {
    console.error('deleteAnnouncement error:', error)
    return { error: 'Failed to delete announcement.' }
  }

  await recordActivity(
    announcement.league_id,
    user.id,
    'announcement_deleted',
    'Announcement deleted',
    { announcementId },
  )

  return { announcementId }
}

/**
 * Record that the current user has read an announcement. Active members
 * only (read tracking hangs off league_members.id); the unique index on
 * (announcement_id, member_id) makes this an idempotent upsert.
 */
export async function markRead(
  announcementId: string,
): Promise<MarkReadResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(announcementId)) {
    return { error: 'Invalid announcement ID.' }
  }

  const announcement = await loadLiveAnnouncement(announcementId)
  if (!announcement) {
    return { error: 'Announcement not found.' }
  }

  const memberId = await loadActiveMemberId(announcement.league_id, user.id)
  if (!memberId) {
    return { error: 'You are not an active member of this league.' }
  }

  // Was this member already recorded? Decide `alreadyRead` before the
  // upsert refreshes read_at, so the flag reports the prior state.
  const { data: existing, error: existingError } = await db
    .from('announcement_reads')
    .select('id')
    .eq('announcement_id', announcementId)
    .eq('member_id', memberId)
    .maybeSingle()

  if (existingError) {
    console.error('markRead lookup error:', existingError)
  }
  const alreadyRead = Boolean(existing)

  const { data, error } = await db
    .from('announcement_reads')
    .upsert(
      {
        announcement_id: announcementId,
        member_id: memberId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'announcement_id,member_id' },
    )
    .select('id')
    .single()

  if (error || !data) {
    console.error('markRead upsert error:', error)
    return { error: 'Failed to mark announcement as read.' }
  }

  return { readId: (data as unknown as { id: string }).id, alreadyRead }
}

/**
 * All active (non-deleted) announcements for a league, pinned first then
 * newest first, with read state for the current user. Any league member or
 * the commissioner may read; outsiders get an empty result framed as an
 * error by the page gate (loadLeagueContext 404s first in practice).
 */
export async function getAnnouncements(
  leagueId: string,
): Promise<GetAnnouncementsResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  // Membership gate: commissioner-of-league or active member.
  const { data: leagueData, error: leagueError } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (leagueError || !leagueData) {
    return { error: 'League not found.' }
  }
  const commissionerId = (leagueData as unknown as { commissioner_id: string })
    .commissioner_id

  const isCommissioner = commissionerId === user.id
  const memberId = await loadActiveMemberId(leagueId, user.id)
  if (!isCommissioner && !memberId) {
    return { error: 'You are not a member of this league.' }
  }

  const announcements = await loadAnnouncements(leagueId, user.id)
  return { announcements }
}
