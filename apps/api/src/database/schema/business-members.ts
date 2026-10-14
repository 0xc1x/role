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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { businessLocations } from './business-locations';
import { profiles } from './profiles';

/**
 * Los cuatro vocabularios del eje de negocio, en `public` y de verdad.
 *
 * A diferencia de `announcements`, acá SÍ son enums de Postgres y no `text` con
 * CHECK. La diferencia con `severity` es qué pasa al agregar un valor: `severity`
 * es una cadena de salida y `info` o `required` es un hecho editorial, mientras
 * que un valor de rol o de plan es una decisión sobre QUÉ PUEDE HACER una
 * persona, y el motor de límites lo lee para contar. Un `pgEnum` obliga a una
 * migración por cada valor nuevo, y aquí eso es lo correcto: el vocabulario
 * cambia por decisión y no por conveniencia.
 *
 * `business_feature` existe sin efecto asociado todavía (`visibility_plus` no
 * hace nada): es el asiento del plan, y llegar sin la feature es más caro que
 * llegar con una que hoy es un no-op.
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

export const businessPlanCodeEnum = pgEnum('business_plan_code', [
  'free',
  'pro',
  'pro_plus',
]);

export const businessFeatureEnum = pgEnum('business_feature', [
  'staff_access',
  'payments',
  'visibility_plus',
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
 * `lower(alias)` SIN `where deleted_at is null`. Esa ausencia es la garantía: un
 * índice único parcial devolvería el alias a la bolsa en cuanto la fila se da de
 * baja, y el `auth.users` de esa fila puede seguir vivo. Alias dado de baja,
 * alias quemado.
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
    // tiene `.unique()`. Lo que hace la garantía es UNIQUE sobre una EXPRESIÓN —
    // que `Caja@Panaderia.ec` y `caja@panaderia.ec` sean el mismo alias— y no
    // tener predicado, para que el alias no vuelva a la bolsa.
    uniqueIndex('business_members_alias_key').on(sql`lower(${table.alias})`),
  ],
);

/**
 * El alcance por sucursal de un miembro: qué filas tiene acceso a cuáles.
 *
 * Tabla aparte y no una columna `location_id` porque un `manager` de dos
 * sucursales es UN miembro con DOS filas de alcance, no dos miembros: duplicar
 * la fila duplicaría también el alias, y el alias es único globalmente.
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

/**
 * El plan de cada negocio: el asiento de la monetización.
 *
 * UNA fila por negocio y solo si alguien eligió un plan. No hay backfill y no
 * debe haberlo: un negocio sin fila se lee `free` por el `coalesce` de los
 * triggers de límites, y sembrar `free` en todas partes sería afirmar que cada
 * negocio eligió un plan. Nadie lo eligió.
 */
export const businessPlansState = pgTable('business_plans_state', {
  business_id: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  plan_code: businessPlanCodeEnum('plan_code').notNull().default('free'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
