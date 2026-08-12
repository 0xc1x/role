import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appRoleEnum } from './enums';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  full_name: text('full_name'),
  avatar_url: text('avatar_url'),
  phone: text('phone'),
  role: appRoleEnum('role').notNull().default('user'),
  city: text('city'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
