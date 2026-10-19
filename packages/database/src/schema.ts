import {pgTable,uuid,text,jsonb,timestamp,integer} from 'drizzle-orm/pg-core';
export const users=pgTable('users',{id:uuid().primaryKey().defaultRandom(),email:text().notNull().unique(),passwordHash:text('password_hash').notNull()});
export const accountLabels=pgTable('account_labels',{accountId:text('account_id').primaryKey(),data:jsonb().notNull()});
export const scanJobs=pgTable('scan_jobs',{id:uuid().primaryKey().defaultRandom(),key:text().notNull().unique(),username:text().notNull(),status:text().notNull(),checkpoint:jsonb().notNull(),result:jsonb(),pages:integer().notNull().default(0),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow()});
