import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
  foreignKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from '../schema';

// Leagues table
export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  commissionerId: uuid('commissioner_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// League members (junction between users and leagues)
export const leagueMembers = pgTable('league_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp('left_at', { withTimezone: true }),
  // status could be derived from leftAt
}, (table) => [
  uniqueIndex('league_members_league_user_idx').on(table.leagueId, table.userId),
  index('league_members_user_idx').on(table.userId),
]);

// Roles are league-scoped
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  name: text('name').notNull(), // e.g., 'Commissioner', 'Treasurer'
  description: text('description'),
  isDefault: boolean('is_default').default(false), // whether this role is a default role template
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('roles_league_name_idx').on(table.leagueId, table.name),
]);

// Permissions global catalog
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull(), // e.g., 'league', 'financial', 'communications'
  action: text('action').notNull(), // e.g., 'view', 'create', 'edit', 'delete'
  resource: text('resource').notNull(), // e.g., 'ledger', 'member', 'rule'
  description: text('description'),
  // computed column: permission_key = `${domain}.${resource}.${action}`
}, (table) => [
  uniqueIndex('permissions_domain_resource_action_idx').on(table.domain, table.resource, table.action),
]);

// Junction: role_permissions
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').references(() => roles.id).notNull(),
  permissionId: uuid('permission_id').references(() => permissions.id).notNull(),
  granted: boolean('granted').default(true), // could be false to explicitly deny
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
]);

// Junction: member_roles (member can have multiple roles)
export const memberRoles = pgTable('member_roles', {
  memberId: uuid('member_id').references(() => leagueMembers.id).notNull(),
  roleId: uuid('role_id').references(() => roles.id).notNull(),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.roleId] }),
]);

// Member-specific permission overrides (overrides role-based permissions)
export const memberPermissionOverrides = pgTable('member_permission_overrides', {
  memberId: uuid('member_id').references(() => leagueMembers.id).notNull(),
  permissionId: uuid('permission_id').references(() => permissions.id).notNull(),
  granted: boolean('granted').notNull(), // true = grant, false = deny (explicit override)
}, (table) => [
  primaryKey({ columns: [table.memberId, table.permissionId] }),
]);

// Types inference
export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeagueMember = typeof leagueMembers.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
export type MemberRole = typeof memberRoles.$inferSelect;
export type NewMemberRole = typeof memberRoles.$inferInsert;
export type MemberPermissionOverride = typeof memberPermissionOverrides.$inferSelect;
export type NewMemberPermissionOverride = typeof memberPermissionOverrides.$inferInsert;