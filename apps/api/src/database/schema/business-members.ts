import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { businessLocations } from './business-locations';
import { profiles } from './profiles';

/**
 * Los dos vocabularios del ACCESO, en `public` y de verdad.
 *
 * A diferencia de `announcements`, acá SÍ son enums de Postgres y no `text` con
 * CHECK. La diferencia con `severity` es qué pasa al agregar un valor: `severity`
 * es una cadena de salida y `info` o `required` es un hecho editorial, mientras
 * que un valor de rol es una decisión sobre QUÉ PUEDE HACER una persona, y el
 * motor de límites lo lee para contar. Un `pgEnum` obliga a una migración por
 * cada valor nuevo, y aquí eso es lo correcto: el vocabulario cambia por
 * decisión y no por conveniencia.
 *
 * Los otros dos vocabularios del eje —el CÓDIGO del plan y sus FEATURES— no
 * están aquí: viven en `subscription-plans.ts`, que es el fichero del
 * catálogo. Aquí no los usaba nadie, y un fichero que define un vocabulario
 * ajeno es un sitio donde el siguiente busca el enum y no lo encuentra.
 */
export const businessMemberRoleEnum = pgEnum('business_member_role', [
  'owner',
  'manager',
  'staff',
]);

export const businessMemberStatusEnum = pgEnum('business_member_status', [
  'active',
  'disabled',
]);

/**
 * Quién tiene acceso a qué negocio, y con qué rol DENTRO de ese negocio.
 *
 * `profiles.role` sigue siendo el rol de PLATAFORMA (`user` | `business` |
 * `admin`) y no se toca: esta tabla es el otro eje. Toda fila acá implica
 * `profiles.role = 'business'`.
 *
 * Sustituye a `business_ownership` —`business_id` como PRIMARY KEY, una sola
 * persona por negocio— y el backfill que la llena todavía no corrió: la tabla
 * nasce vacía y el cambio de policies viene después (spec §6.2).
 *
 * LA ESCRIBE EL API CON `service_role`, NUNCA EL CLIENTE. El alta de un acceso
 * crea un `auth.users` real (`admin.createUser`), que está fuera de una sesión
 * normal; el grant de lectura al cliente llega más adelante, junto con su policy
 * (§6.3). Por eso esta tabla no tiene ninguna policy de escritura.
 *
 * `alias` espeja `auth.users.email` para poder listar accesos sin privilegio de
 * lectura sobre `auth`, y `business_members_alias_key` lo hace único sobre
 * `(business_id, lower(alias))` SIN `where deleted_at is null`. Esa ausencia es la
 * garantía: un índice único parcial devolvería el alias a la bolsa en cuanto la fila
 * se da de baja, y el `auth.users` de esa fila puede seguir vivo. Alias dado de
 * baja, alias quemado.
 *
 * El `business_id` está en el índice porque el alias identifica un ACCESO y no a
 * una persona: el mismo dueño que dirige seis negocios es seis filas con el mismo
 * alias, y un índice global afirmaría que una persona no puede estar en dos
 * negocios. En producción `admin@fudi.app` dirige 6 de los 16.
 *
 * Y por eso hay DOS unicidades y no una: `(business_id, lower(alias))` es el acceso
 * —una fila por negocio—, y `(business_id, user_id)` es la persona —una fila por
 * persona y negocio—. Son cosas distintas y se rompen distinto.
 */
export const businessMembers = pgTable(
  'business_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    business_id: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: businessMemberRoleEnum('role').notNull().default('staff'),
    label: text('label').notNull(),
    alias: text('alias').notNull(),
    status: businessMemberStatusEnum('status').notNull().default('active'),
    // 0 es "sin expiración" (modo equipo propio), no "sin sesión": el valor por
    // defecto es el turno de 24 h.
    session_ttl_hours: integer('session_ttl_hours').notNull().default(24),
    last_authenticated_at: timestamp('last_authenticated_at', {
      withTimezone: true,
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // `>= 0` y no `> 0`: cero es el modo "equipo propio", una decisión explícita
    // del dueño, así que el CHECK lo tiene que dejar pasar.
    check(
      'business_members_session_ttl_hours_check',
      sql`${table.session_ttl_hours} >= 0`,
    ),
    // Una persona es UN miembro por negocio con UN rol; su alcance sobre varias
    // sucursales son varias filas en `business_member_locations`, no varias
    // membresías. Sin esto el API puede dar de alta la misma persona dos veces en
    // el mismo negocio con roles distintos, y `business_member_role()` tendría que
    // elegir una al azar. Es `unique()` y no `uniqueIndex()` porque en la base
    // viva es una CONSTRAINT con nombre —`20261014005756_business_members_business_user_unique`—,
    // y el espejo nombra las constraints como las nombra Postgres, igual que
    // `business_hours_business_id_day_key` y `business_locations_id_business_id_key`.
    unique('business_members_business_id_user_id_key').on(
      table.business_id,
      table.user_id,
    ),
    // Los dos de lectura llevan el parcial porque toda lectura de membresías
    // filtra `deleted_at is null`: una fila dada de baja no concede acceso por
    // ningún camino. El del alias NO lleva parcial, y no es un olvido.
    index('business_members_business')
      .on(table.business_id)
      .where(sql`${table.deleted_at} is null`),
    index('business_members_user')
      .on(table.user_id)
      .where(sql`${table.deleted_at} is null`),
    // `uniqueIndex` y no `index(...).unique()`: el builder de un índice normal no
    // tiene `.unique()`. Lo que hace la garantía es ser UNIQUE sobre una
    // EXPRESIÓN —que `Caja@Panaderia.ec` y `caja@panaderia.ec` sean el mismo
    // alias DENTRO de un negocio— y no tener predicado, para que el alias no
    // vuelva a la bolsa. El `business_id` va primero: es el que hace la unicidad
    // por negocio, y sin él el índice affirmaría que una persona no puede dirigir
    // dos negocios.
    uniqueIndex('business_members_alias_key').on(
      table.business_id,
      sql`lower(${table.alias})`,
    ),
  ],
);

/**
 * El alcance por sucursal de un miembro: qué filas tiene acceso a cuáles.
 *
 * Tabla aparte y no una columna `location_id` porque un `manager` de dos
 * sucursales es UN miembro con DOS filas de alcance, no dos miembros: duplicar la
 * fila no cambia quién es ni qué puede hacer.
 *
 * La PK compuesta hace que reintentar el alta de una fila no crezca.
 */
export const businessMemberLocations = pgTable(
  'business_member_locations',
  {
    member_id: uuid('member_id')
      .notNull()
      .references(() => businessMembers.id, { onDelete: 'cascade' }),
    location_id: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.member_id, table.location_id] }),
  }),
);

// El plan de cada negocio NO vive aquí: vive en `subscriptions`
// (`schema/subscriptions.ts`), que es la tabla que sustituyó a
// `business_plans_state`. La razón es el SUJETO: allí el sujeto es una
// columna (`business_id` o `user_id`) y el plan es una fila, no una columna de
// la fila del negocio.
