import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDIENTE',
  'PROCESADO',
  'ERROR',
]);

/**
 * Canal de origen de la entrada. Deliberadamente un enum y no un `text` como
 * `state`: el conjunto de canales sí es cerrado y conocido.
 */
export const entryOriginEnum = pgEnum('entry_origin', [
  'ios',
  'android',
  'pwa',
  'web',
]);

/**
 * Store genérico para datos no modelados (leads de contacto, reportes de
 * error, etc). Inspirado en app_config pero con id uuid y un eje de
 * `delivery_status` para el procesamiento async.
 *
 * `delivery_status` y `state` son ORTOGONALES, no dos variantes del mismo
 * eje: el primero contesta "¿llegó el aviso al equipo?" y el segundo "¿está
 * resuelto?". Un mensaje de contacto usa solo el primero y lleva `state` en
 * `NULL` siempre; un reporte de error usa los dos.
 *
 * `state` es `text` y no un enum a propósito: un enum obliga a migrar cada vez
 * que aparece un namespace nuevo, que es exactamente el acoplamiento que un
 * store genérico tiene que evitar. El vocabulario vive fuera de la tabla.
 */
export const appStore = pgTable(
  'app_store',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: text('namespace').notNull(),
    key: text('key'),
    value: jsonb('value').notNull(),
    delivery_status: deliveryStatusEnum('delivery_status')
      .notNull()
      .default('PENDIENTE'),
    state: text('state'),
    origin: entryOriginEnum('origin'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('app_store_namespace_idx').on(table.namespace),
    index('app_store_delivery_status_idx').on(table.delivery_status),
    index('app_store_state_idx').on(table.state),
    index('app_store_created_at_idx').on(table.created_at),
  ],
);
