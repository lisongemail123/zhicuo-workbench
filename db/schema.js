import { sqliteTable,text,integer,primaryKey,index } from 'drizzle-orm/sqlite-core';
export const cloudEntities=sqliteTable('cloud_entities',{
 kind:text('kind').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),deleted:integer('deleted').notNull().default(0),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.kind,t.id]}),index('cloud_entities_kind_updated').on(t.kind,t.updatedAt)]);
export const cloudPhotos=sqliteTable('cloud_photos',{
 id:text('id').primaryKey(),storageKey:text('storage_key').notNull(),mimeType:text('mime_type').notNull(),byteLength:integer('byte_length').notNull(),fileName:text('file_name').notNull(),createdAt:text('created_at').notNull()
});
