import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessPlanCodeEnum } from './subscription-plans';
import { businesses } from './businesses';
import { profiles } from './profiles';

/**
 * La suscripción: UNA fila que dice qué plan tiene un sujeto.
 *
 * ─── POR QUÉ EL SUJETO ES UNA COLUMNA Y NO LA TABLA ──────────────────────────
 *
 * La tabla que sustituye a esta —`business_plans_state`— tenía `business_id`
 * como PRIMARY KEY: el sujeto era el negocio y estaba cosido a la forma de la
 * tabla. Una suscripción de una persona era IMPOSIBLE de representar sin
 * inventar otra tabla con las mismas columnas, y por eso el plan de un
 * negocio y el plan de una persona no podían ser la misma cosa.
 *
 * Aquí el sujeto es UNA COLUMNA: `business_id` para un negocio y `user_id` para
 * una persona, y el CHECK exige exactamente uno de los dos. El mismo código de
 * negocio del API lee los dos, y `business_plan_of` sólo mira el suyo.
 *
 * ─── VIVA, CANCELADA Y ARCHIVADA ─────────────────────────────────────────────
 *
 * Una fila concede plan mientras `cancelled_at is null and deleted_at is null`.
 * Cancelada es la baja del contrato; archivada es el mismo silencio que el de
 * la tabla vieja. Las dos se quedan en la tabla porque el HISTORIAL de planes
 * es información: cuándo un negocio estuvo en `pro` y hasta cuándo importa.
 *
 * ─── POR QUÉ `plan_code` NO ES UNA FK AL CATÁLOGO ────────────────────────────
 *
 * Porque el que se niega a un plan que no está en el catálogo es el MOTOR, y
 * se niega en voz alta. Una FK con `cascade` devolvería al negocio a `free` en
 * silencio cuando el plan saliera del catálogo, y una con `restrict` haría
 * inalcanzable la negativa del motor. La columna es el enum y el motor lee el
 * catálogo; esta tabla no opina.
 *
 * ─── EL ÍNDICE ÚNICO SÓLO ABORDA EL SUJETO DE NEGOCIO ───────────────────────
 *
 * `subscriptions_live_business_key` es UNIQUE sobre `(business_id)` y lo es
 * SÓLO para las filas vivas. Del sujeto de persona NO hay índice: dos
 * suscripciones vivas de la misma persona se pueden meter hoy.
 *
 * Es correcto a propósito: los planes de consumidor están fuera de este plan
 * —no hay superficie que los ofrezca y no se siembra ni uno—, así que la
 * unicidad de ese sujeto no protege nada todavía. Pero el día que exista un
 * `user_plan_of` —el gemelo de `business_plan_of` para las personas— esta
 * tabla necesita su propio índice único parcial, con la misma forma que el del
 * negocio: `on (user_id) where user_id is not null and cancelled_at is null and
 * deleted_at is null`. Está anotado acá para que ese día se escriba con el
 * mismo criterio, y no se descubra entonces que faltaba.
 *
 * ─── `updated_at` LO MANTIENE UN TRIGGER, NO LA APLICACIÓN ───────────────────
 *
 * El trigger `set_subscriptions_updated_at` de la base pone `now()` en la
 * columna. La API que escriba esta tabla NO manda `updated_at`: el trigger la
 * pisa, y mandar una fecha a mano sería escribir una verdad que el motor
 * corrige después.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Las dos columnas son nulables a propósito: la fila tiene UN sujeto, y el
    // CHECK de abajo es lo que dice cuál. Una FK no puede decir "al menos una
    // de las dos".
    business_id: uuid('business_id').references(() => businesses.id, {
      onDelete: 'cascade',
    }),
    user_id: uuid('user_id').references(() => profiles.id, {
      onDelete: 'cascade',
    }),
    plan_code: businessPlanCodeEnum('plan_code').notNull(),
    started_at: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Exactamente un sujeto: hay sujeto, hay UN sujeto, y es del tipo que dice
    // ser. El nombre es el de la constraint de la base viva, para que el
    // espejo y la base nombren la cosa igual.
    check(
      'subscriptions_subject_check',
      sql`(${table.business_id} is not null) <> (${table.user_id} is not null)`,
    ),
    // UNIQUE sólo para las filas VIVAS. La suscripción cancelada se queda
    // para el historial y la nueva entra al lado; lo que no puede haber son
    // dos planes vivos del mismo negocio, porque eso es un plan con dos
    // respuestas.
    uniqueIndex('subscriptions_live_business_key')
      .on(table.business_id)
      .where(
        sql`${table.business_id} is not null and ${table.cancelled_at} is null and ${table.deleted_at} is null`,
      ),
  ],
);
