import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tips = pgTable('tips', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
