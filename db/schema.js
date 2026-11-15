import { sqliteTable,text,integer,primaryKey,index,uniqueIndex } from 'drizzle-orm/sqlite-core';
export const cloudEntities=sqliteTable('cloud_entities',{
 kind:text('kind').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),deleted:integer('deleted').notNull().default(0),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.kind,t.id]}),index('cloud_entities_kind_updated').on(t.kind,t.updatedAt)]);
export const cloudPhotos=sqliteTable('cloud_photos',{
 id:text('id').primaryKey(),storageKey:text('storage_key').notNull(),mimeType:text('mime_type').notNull(),byteLength:integer('byte_length').notNull(),fileName:text('file_name').notNull(),createdAt:text('created_at').notNull()
});
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),username:text('username'),displayName:text('display_name').notNull(),email:text('email').notNull().default(''),passwordHash:text('password_hash'),siteUserId:text('site_user_id'),role:text('role').notNull().default('user'),status:text('status').notNull().default('active'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[uniqueIndex('users_username').on(t.username),uniqueIndex('users_site_identity').on(t.siteUserId)]);
export const sessions=sqliteTable('sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull()
},t=>[index('sessions_user').on(t.userId)]);
export const workspaces=sqliteTable('workspaces',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),personal:integer('personal').notNull().default(0),createdAt:text('created_at').notNull()
},t=>[index('workspaces_owner').on(t.ownerId)]);
export const memberships=sqliteTable('workspace_members',{
 workspaceId:text('workspace_id').notNull(),userId:text('user_id').notNull(),role:text('role').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.workspaceId,t.userId]}),index('members_user').on(t.userId)]);
export const workspaceEntities=sqliteTable('workspace_entities',{
 workspaceId:text('workspace_id').notNull(),kind:text('kind').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),deleted:integer('deleted').notNull().default(0),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.workspaceId,t.kind,t.id]}),index('workspace_entities_updated').on(t.workspaceId,t.kind,t.updatedAt)]);
export const workspacePhotos=sqliteTable('workspace_photos',{
 workspaceId:text('workspace_id').notNull(),id:text('id').notNull(),storageKey:text('storage_key').notNull(),mimeType:text('mime_type').notNull(),byteLength:integer('byte_length').notNull(),fileName:text('file_name').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.workspaceId,t.id]})]);
export const invites=sqliteTable('workspace_invites',{
 tokenHash:text('token_hash').primaryKey(),workspaceId:text('workspace_id').notNull(),role:text('role').notNull(),createdBy:text('created_by').notNull(),expiresAt:text('expires_at').notNull(),usedBy:text('used_by'),createdAt:text('created_at').notNull()
});
export const resetTokens=sqliteTable('password_resets',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:text('expires_at').notNull(),usedAt:text('used_at')
});
export const settings=sqliteTable('app_settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const auditLogs=sqliteTable('audit_logs',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),target:text('target').notNull(),createdAt:text('created_at').notNull()
},t=>[index('audit_created').on(t.createdAt)]);
export const authLimits=sqliteTable('auth_limits',{
 key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:text('expires_at').notNull()
});
