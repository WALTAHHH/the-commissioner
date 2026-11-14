import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { leagueMembers } from './members';
import { authUsers } from './auth';

/**
 * Announcements — commissioners broadcast messages to a league's members;
 * read state is tracked per member so the UI can show "new since you last
 * saw it" without touching the announcement itself.
 *
 * `body` is markdown as authored (rendering/sanitisation happens at the
 * React boundary via src/components/markdown-body, same as rules).
 *
 * Deletes are soft (`deleted_at`); every read path in the app must filter
 * `.is('deleted_at', null)` exactly like `src/lib/rules.ts` does.
 *
 * `member_id` on announcement_reads references `league_members.id` — the
 * same convention as `poll_votes.member_id`, so "who is a member" stays a
 * single join. A user removed from the league keeps their auth identity but
 * their membership row is no longer `status = 'active'`, which is what the
 * action layer checks before recording a read.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => authUsers.id)
      .notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(), // markdown, rendered client-safe
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // nullable = soft delete
  },
  (table) => [
    // The list query is always "one league, non-deleted, pinned first,
    // newest first" — these two indexes cover it.
    index('announcements_league_id_idx').on(table.leagueId),
    index('announcements_pinned_created_idx').on(table.leagueId, table.isPinned, table.createdAt),
  ],
);

export const announcementReads = pgTable(
  'announcement_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id')
      .references(() => announcements.id)
      .notNull(),
    memberId: uuid('member_id')
      .references(() => leagueMembers.id)
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One read row per (announcement, member): repeat marks are upserts of
    // read_at, never duplicates, and the list query joins on announcement.
    uniqueIndex('announcement_reads_announcement_member_idx').on(
      table.announcementId,
      table.memberId,
    ),
    index('announcement_reads_member_id_idx').on(table.memberId),
  ],
);
