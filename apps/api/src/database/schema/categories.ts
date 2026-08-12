import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  emoji: text('emoji'),
  slug: text('slug').notNull().unique(),
  image_url: text('image_url'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
