import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Configuración dinámica de la plataforma. Espeja la migración
 * `create_app_config` en Supabase (fuente de verdad del schema).
 */
export const appConfig = pgTable(
  'app_config',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    value_type: text('value_type').notNull().default('string'),
    category: text('category').notNull().default('general'),
    label: text('label').notNull(),
    description: text('description'),
    is_public: boolean('is_public').notNull().default(true),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('app_config_category_idx').on(table.category)],
);
