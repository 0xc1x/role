import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/**
 * Vocabulario de `severity` y `audience_kind`: espejo de los CHECK de la
 * migración, no un enum de Postgres.
 *
 * En la base son `text` con CHECK a propósito —un `pgEnum` obliga a una
 * migración cada vez que aparece un valor—, así que acá tampoco se declara un
 * enum: la opción `enum` de `text` solo le pone el tipo a la columna para que el
 * compilador no pueda inventarse un valor. No crea ni pide ningún tipo en
 * Postgres.
 *
 * Las dos listas se comparan contra los enums del contrato en
 * `announcements.mapper.spec.ts`. Si alguien agrega un valor al CHECK y al
 * contrato y olvida esta copia, ese test se pone rojo en vez de dejar que un
 * mapper castee un valor que el contrato no acepta.
 */
export const ANNOUNCEMENT_SEVERITIES = ['info', 'required'] as const;

export const ANNOUNCEMENT_AUDIENCE_KINDS = [
  'all',
  'consumers',
  'businesses',
  'specific',
] as const;

/**
 * Avisos del operador. Espejo de `public.announcements`, escrita por
 * `supabase/migrations/20261004022647_announcements.sql`.
 *
 * LA ELEGIBILIDAD ESTA EN LA POLICY, NO ACA. Esta tabla no declara el filtro de
 * la ventana ni nada que lo imite: quien decide a quién le toca leer una fila es
 * `Anyone reads the announcements they are eligible for`, y el móvil y el
 * landing leen Supabase directo. Una segunda copia de esa regla acá sería la
 * que nadie corrige.
 *
 * `user_ids` y `business_ids` son el CAMINO DE ESCRITURA —quién publica elige a
 * quién le llega el aviso— y por eso no están en `AnnouncementSchema`: la policy
 * deja leer la misma fila a muchísimos dispositivos, así que mandarlas en el
 * cable le regalaría a cada uno la lista de todos los demás que la locan. La
 * columna existe acá porque el insert las escribe.
 *
 * Sin `deleted_at`, a diferencia de `slides` y `tips`: esta tabla se da de baja
 * con `active = false`, que es la fila que la policy ya esconde. Una columna de
 * borrado lógico sería un segundo interruptor, y puede quedar puesto.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: text('severity', { enum: ANNOUNCEMENT_SEVERITIES }).notNull(),
    audience_kind: text('audience_kind', {
      enum: ANNOUNCEMENT_AUDIENCE_KINDS,
    }).notNull(),
    user_ids: uuid('user_ids').array().notNull().default([]),
    business_ids: uuid('business_ids').array().notNull().default([]),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    start_at: timestamp('start_at', { withTimezone: true }),
    end_at: timestamp('end_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NOT NULL, a diferencia de `slides` y `tips`: acá no hay borrado lógico y
    // el update refresca el valor siempre, así que una fila sin `updated_at`
    // sería una fila que nadie volvió a tocar.
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // El parcial es el que sirve la consulta de la app: siempre trae `active`, y
    // un índice que guarda filas que nadie lee es costo de escritura. El orden
    // (`priority desc, created_at desc`) es el del read path.
    index('announcements_active_priority_created_at_idx')
      .on(table.active, table.priority.desc(), table.created_at.desc())
      .where(sql`${table.active}`),
    index('announcements_user_ids_idx').using('gin', table.user_ids),
    index('announcements_business_ids_idx').using('gin', table.business_ids),
  ],
);

/**
 * Estado de lectura de un aviso obligatorio. PK compuesta: una fila por usuario
 * y aviso, que es lo que hace que reintentar no crezca.
 *
 * `announcement_id` borra en cascada, igual que en la base: si el aviso se da de
 * baja, sus acks no pueden quedar colgando de una fila que ya no existe. Y no
 * hay UPDATE ni DELETE de filas —la policy no los tiene—, así que el
 * acknowledge es un INSERT ... ON CONFLICT DO NOTHING: la única forma de
 * reintentar sin necesitar un UPDATE.
 *
 * `user_id` apunta a `profiles` y no a `auth.users`, que es lo que la base
 * tiene. Es la misma divergencia declarada que siguen `marketing_preferences` y
 * `payment_methods`, y `mirror-fidelity.db.spec.ts` la registra en las dos
 * direcciones. La diferencia es observable —la cascada sigue a un borrado de
 * perfil en el espejo y a uno de usuario de auth en producción— y ningún módulo
 * borra en hard: la baja de una cuenta anonimiza.
 */
export const announcementAcknowledgements = pgTable(
  'announcement_acknowledgements',
  {
    announcement_id: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.announcement_id, table.user_id] }),
  }),
);
