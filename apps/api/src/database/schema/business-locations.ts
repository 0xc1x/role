import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

// Nota: la tabla tiene además la columna generada `geog` (geography PostGIS,
// ADR-0010) que vive solo en Supabase. No se declara en el espejo porque el
// espejo de test (postgres:16-alpine, sin postgis) no puede crearla; las
// queries que la usan la referencian como SQL crudo.

export const businessLocations = pgTable('business_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'no action' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  phone: text('phone'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  zone: text('zone'),
  is_headquarter: boolean('is_headquarter').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
