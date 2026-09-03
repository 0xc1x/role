import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const storeEntryStatusEnum = pgEnum('store_entry_status', [
  'PENDIENTE',
  'PROCESADO',
  'ERROR',
]);

/**
 * Store genérico para datos no modelados (leads de contacto, etc).
 * Inspirado en app_config pero con id uuid y status para procesamiento async.
 */
export const appStore = pgTable(
  'app_store',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: text('namespace').notNull(),
    key: text('key'),
    value: jsonb('value').notNull(),
    status: storeEntryStatusEnum('status').notNull().default('PENDIENTE'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('app_store_namespace_idx').on(table.namespace),
    index('app_store_status_idx').on(table.status),
    index('app_store_created_at_idx').on(table.created_at),
  ],
);
