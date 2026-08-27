import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { offers } from './offers';
import { profiles } from './profiles';

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  offer_id: uuid('offer_id')
    .notNull()
    .references(() => offers.id),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
