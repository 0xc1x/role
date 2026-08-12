import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { offers } from './offers';

export const offerCategories = pgTable(
  'offer_categories',
  {
    offer_id: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    category_id: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.offer_id, table.category_id] }),
  }),
);
