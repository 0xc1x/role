import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { orders } from './orders';
import { profiles } from './profiles';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'no action' }),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'no action' }),
  order_id: uuid('order_id').references(() => orders.id, {
    onDelete: 'no action',
  }),
  rating: integer('rating'),
  comment: text('comment'),
  product_rating: integer('product_rating'),
  business_rating: integer('business_rating'),
  /**
   * Soft-hide, nunca borrado: la fila se conserva para que exista un registro
   * de qué se ocultó y por qué, y para que `UNIQUE(user_id, order_id)` siga
   * impeciendo que el autor la vuelva a publicar.
   *
   * REQUIERE la migración `20260927013000_reviews_moderation_soft_hide`: este
   * espejo se genera con `drizzle-kit generate`, así que los tests de DB solo
   * ven estas columnas después de regenerarlo.
   */
  is_hidden: boolean('is_hidden').notNull().default(false),
  moderated_at: timestamp('moderated_at', { withTimezone: true }),
  /**
   * `ON DELETE SET NULL` en la base: borrar la cuenta del admin no puede borrar
   * la reseña ni el motivo, solo deja el nombre del moderador desconocido.
   */
  moderated_by: uuid('moderated_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  /** Motivo del operador. Sobrevive al desocultamiento: es el registro de apelación. */
  hidden_reason: text('hidden_reason'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
