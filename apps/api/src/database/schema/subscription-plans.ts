import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Los dos vocabularios del CATÁLOGO: el código del plan y sus features.
 *
 * ─── POR QUÉ SON ENUMS DE POSTGRES Y NO `text` CON CHECK ──────────────────────
 *
 * Porque el motor los LEE para comparar —`business_plan_of` devuelve un
 * código, el trigger compara contra él— y una comparación contra una cadena
 * es una comparación que puede fallar por una tilde. Un `pgEnum` obliga a una
 * migración por cada valor nuevo, y aquí eso es lo correcto: el vocabulario
 * cambia por decisión y no por conveniencia.
 *
 * `business_feature` existe sin efecto asociado todavía (`visibility_plus` no
 * hace nada): es el asiento del plan, y llegar sin la feature es más caro que
 * llegar con una que hoy es un no-op.
 *
 * ─── Y POR QUÉ VIVEN AQUÍ Y NO EN EL FICHERO DE LOS MIEMBROS ───────────────────
 *
 * Porque el CATÁLOGO es su dueño: `subscription_plans` y
 * `subscription_plan_features` los usan, y `subscriptions` los usa como el
 * código de su plan. El fichero de los miembros no los usaba para nada, y un
 * vocabulario que vive en un fichero que no lo usa es un sitio donde el
 * siguiente lo busca y no lo encuentra.
 */
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
 * A quién se le puede asignar un plan.
 *
 * `business` es un negocio y `consumer` es una persona: el catálogo admite los
 * dos porque la sujeción del plan va a ser genérica, y no se siembra ningún plan
 * de `consumer` porque no hay superficie que lo ofrezca.
 */
export const planAudienceEnum = pgEnum('plan_audience', [
  'business',
  'consumer',
]);

/**
 * El catálogo de planes: UNA fila por plan, y la fila es la fuente.
 *
 * ─── POR QUÉ ES UNA TABLA Y NO CÓDIGO ────────────────────────────────────────
 *
 * El catálogo era una constante de TypeScript (`BUSINESS_PLAN_LIMITS`,
 * `BUSINESS_PLAN_FEATURES`) y los MISMOS números estaban escritos a mano en el
 * cuerpo de los triggers. Dos copias, y entre dos copias no hay nada que las
 * ate: el dueño lee «2 miembros» en el panel, el motor corta en 3, y nada en el
 * sistema se da cuenta. Con la tabla, el número que se hace cumplir y el
 * número que se dice en voz alta salen de la MISMA fila.
 *
 * `packages/commons` queda como el espejo TIPADO de estas dos tablas: el
 * vocabulario que el compilador conoce, para que ningún consumidor escriba un
 * `plan_code` a mano. El guard de `src/database/security/` lee el catálogo
 * VIVO y lo compara con ese espejo, celda por celda.
 *
 * ─── `null` ES «SIN TOPE», Y NO ES `0` ───────────────────────────────────────
 *
 * `max_locations` y `max_members` son `null` cuando el plan no tiene tope. Un
 * `0` sería OTRO plan —uno en el que no se puede tener ni una sucursal—, y el
 * CHECK de abajo prohíbe que un tope sea cero para que la confusión no pueda
 * entrar por la puerta de atrás.
 *
 * ─── `is_active` NO ES PARTE DEL CONTRATO ───────────────────────────────────
 *
 * Es operativo: retira un plan de la oferta sin borrarlo. No tiene espejo en
 * TypeScript y no lo va a tener, porque no es un dato del catálogo sino una
 * decisión del día.
 */
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    code: businessPlanCodeEnum('code').primaryKey(),
    audience: planAudienceEnum('audience').notNull(),
    max_locations: integer('max_locations'),
    max_members: integer('max_members'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Un tope es un entero POSITIVO o no es un tope: `null` es «sin tope» y
    // `0` es un plan distinto. El CHECK lleva el nombre que tiene en la base
    // viva —`subscription_plans_limits_check`— para que el espejo y la base
    // nombren la constraint igual, como en
    // `business_members_session_ttl_hours_check`.
    check(
      'subscription_plans_limits_check',
      sql`(${table.max_locations} is null or ${table.max_locations} > 0) and (${table.max_members} is null or ${table.max_members} > 0)`,
    ),
  ],
);

/**
 * Qué incluye cada plan: una fila por (plan, feature).
 *
 * Tabla aparte y no una columna `text[]` porque esta lista se consulta con una
 * foreign key: la fila tiene que poder morir con su plan (`on delete cascade`),
 * y una columna no tiene filas que mueran.
 */
export const subscriptionPlanFeatures = pgTable(
  'subscription_plan_features',
  {
    plan_code: businessPlanCodeEnum('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code, { onDelete: 'cascade' }),
    feature: businessFeatureEnum('feature').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.plan_code, table.feature] }),
  }),
);
