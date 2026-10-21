import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type {
  BusinessFeature,
  BusinessMemberRole,
  BusinessPlanCode,
  PlanAudience,
} from '@0xc1x/role-commons';
import { membershipRole } from '../../database/business-membership';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businesses,
  subscriptionPlanFeatures,
  subscriptionPlans,
  subscriptions,
} from '../../database/schema';

/**
 * UN plan del catálogo, con lo que incluye.
 *
 * ─── POR QUÉ LA FILA DEL CATÁLOGO ES LA FUENTE, Y NO EL ESPEJO DE TYPESCRIPT ──
 *
 * `BUSINESS_PLAN_LIMITS` y `BUSINESS_PLAN_FEATURES` siguen existiendo en
 * `packages/commons`, pero son el ESPEJO TIPADO de estas tablas, no su
 * fuente: el dueño lee «2 miembros» en el panel, el motor corta en 3, y entre
 * dos copias no hay nada que las ate. Esta API lee la fila, que es la misma que
 * lee el motor, y por eso las dos respuestas no pueden apartarse.
 */
export type PlanEntry = {
  code: BusinessPlanCode;
  audience: PlanAudience;
  max_locations: number | null;
  max_members: number | null;
  is_active: boolean;
  features: BusinessFeature[];
};

/**
 * La suscripción VIVA de un negocio, con la fila del catálogo de su plan.
 *
 * ─── POR QUÉ LA SUSCRIPCIÓN Y EL CATÁLOGO SON DOS COSAS EN ESTE TIPO ──────────
 *
 * La fila de `subscriptions` dice QUÉ plan tiene el negocio; la fila de
 * `subscription_plans` dice QUÉ incluye ese plan. Son dos hechos y por eso
 * viven en dos campos: una respuesta que los mezclara en un solo objeto no
 * dejaría ver de dónde salió cada número, y un número sin origen es un número
 * que alguien puede cambiar sin que nadie lo note.
 *
 * `plan` es `null` cuando el catálogo no tiene la fila de ese plan: una
 * suscripción viva con un plan que salió del catálogo. El motor se niega en
 * voz alta en ese estado, y esta API también.
 */
export type SubscriptionEntry = {
  plan_code: BusinessPlanCode;
  started_at: Date | null;
  plan: PlanEntry | null;
};

/** La fila de `subscriptions`, tal como la base la tiene. */
export type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * DB executor: root client or an open transaction.
 *
 * The call sites pass `tx` inside `transaction()` so that the two halves of an
 * assignment —the read of the live row and the write on top of it— share one
 * connection and one commit.
 */
export type SubscriptionsDbExecutor = Database;

/**
 * La fila VIVA de un negocio, y sólo la viva.
 *
 * `cancelled_at is null and deleted_at is null` es el mismo predicado que usa
 * `public.business_plan_of` y el mismo que usa el índice único parcial
 * `subscriptions_live_business_key`: una fila cancelada o archivada se queda
 * para decir qué hubo, no para conceder plan. Un negocio cuya única fila está
 * muerta se lee `free`, que es lo que la función responde.
 */
function liveSubscription(businessId: string) {
  return and(
    eq(subscriptions.business_id, businessId),
    isNull(subscriptions.cancelled_at),
    isNull(subscriptions.deleted_at),
  );
}

@Injectable()
export class SubscriptionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Una transacción, con su propio executor.
   *
   * El handle que devuelve es el que se le pasa a las llamadas de escritura:
   * una escritura que se saliera de la transacciónaría la fila FUERA del
   * commit, que es exactamente lo que esta operación no puede hacer.
   */
  transaction<T>(fn: (tx: SubscriptionsDbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * Los planes QUE ESTÁN EN LA OFERTA.
   *
   * `is_active = true` y nada más: retirar un plan de la oferta no lo borra
   * del catálogo, y el catálogo completo —con los retirados— es lo que el
   * motor necesita para seguir aplicando los topes de quien ya los tiene
   * (§4.5: `is_active` no filtra el motor).
   */
  async listActivePlans(): Promise<PlanEntry[]> {
    const rows = await this.db
      .select({
        code: subscriptionPlans.code,
        audience: subscriptionPlans.audience,
        max_locations: subscriptionPlans.max_locations,
        max_members: subscriptionPlans.max_members,
        is_active: subscriptionPlans.is_active,
        feature: subscriptionPlanFeatures.feature,
      })
      .from(subscriptionPlans)
      .leftJoin(
        subscriptionPlanFeatures,
        eq(subscriptionPlanFeatures.plan_code, subscriptionPlans.code),
      )
      .where(eq(subscriptionPlans.is_active, true))
      .orderBy(subscriptionPlans.code, subscriptionPlanFeatures.feature);

    return this.groupPlans(rows);
  }

  /**
   * UN plan del catálogo, esté o no en la oferta.
   *
   * La fila se busca por código y no por «el plan activo»: al asignar hay que
   * poder distinguir «no existe» de «existe pero está retirado», y las dos
   * respuestas son el mismo 422 para quien asigna pero NO son la misma fila.
   */
  async findPlan(code: BusinessPlanCode): Promise<PlanEntry | null> {
    const rows = await this.db
      .select({
        code: subscriptionPlans.code,
        audience: subscriptionPlans.audience,
        max_locations: subscriptionPlans.max_locations,
        max_members: subscriptionPlans.max_members,
        is_active: subscriptionPlans.is_active,
        feature: subscriptionPlanFeatures.feature,
      })
      .from(subscriptionPlans)
      .leftJoin(
        subscriptionPlanFeatures,
        eq(subscriptionPlanFeatures.plan_code, subscriptionPlans.code),
      )
      .where(eq(subscriptionPlans.code, code))
      .orderBy(subscriptionPlanFeatures.feature);

    return this.groupPlans(rows)[0] ?? null;
  }

  /**
   * La suscripción viva del negocio Y la fila del catálogo de su plan, en UNA
   * consulta.
   *
   * ─── POR QUÉ UN `LEFT JOIN` Y NO UN `INNER` ─────────────────────────────────
   *
   * Porque las dos mitades de la respuesta vienen de tablas distintas y las
   * dos tienen que estar en la misma fila: el `plan_code` de la suscripción y
   * los límites del plan. Con un `INNER JOIN` una suscripción cuyo plan no
   * está en el catálogo no saldría — y la ausencia de fila se confundiría con
   * «este negocio no tiene suscripción», que es la mentira que el motor no
   * cuenta: el motor se niega en voz alta. Con el `LEFT JOIN` la fila sale con
   * el catálogo vacío y esta API puede decir que el catálogo está roto.
   *
   * Y las FEATURES vienen en la misma consulta, no en una segunda: la lista de
   * lo que incluye el plan es parte de la misma respuesta, y leerla aparte
   * sería dejar la puerta abierta a que la respuesta nombre un plan y sus
   * límites de una fila y sus features de otra.
   */
  async findBusinessSubscription(
    businessId: string,
  ): Promise<SubscriptionEntry | null> {
    const rows = await this.db
      .select({
        plan_code: subscriptions.plan_code,
        started_at: subscriptions.started_at,
        audience: subscriptionPlans.audience,
        max_locations: subscriptionPlans.max_locations,
        max_members: subscriptionPlans.max_members,
        is_active: subscriptionPlans.is_active,
        feature: subscriptionPlanFeatures.feature,
      })
      .from(subscriptions)
      .leftJoin(
        subscriptionPlans,
        eq(subscriptionPlans.code, subscriptions.plan_code),
      )
      .leftJoin(
        subscriptionPlanFeatures,
        eq(subscriptionPlanFeatures.plan_code, subscriptionPlans.code),
      )
      .where(liveSubscription(businessId))
      .orderBy(subscriptionPlanFeatures.feature);

    const first = rows[0];
    if (!first) return null;

    // `audience` es NOT NULL en el catálogo: que venga `null` significa que la
    // fila del plan NO está, que es el estado roto del que habla el docblock.
    const audience = first.audience;

    return {
      plan_code: first.plan_code,
      started_at: first.started_at,
      plan:
        audience === null
          ? null
          : {
              // El código de la fila del catálogo es el de la suscripción: es la
              // condición del `LEFT JOIN`.
              code: first.plan_code,
              audience,
              max_locations: first.max_locations,
              max_members: first.max_members,
              is_active: first.is_active as boolean,
              features: rows
                .map((row) => row.feature)
                .filter(
                  (feature): feature is BusinessFeature => feature !== null,
                ),
            },
    };
  }

  /**
   * Si el negocio existe.
   *
   * La existencia de un negocio NO es un secreto en esta API: hay una ruta
   * pública que la responde, y el panel ya tiene la lista. Por eso el 404
   * puede ir antes que la puerta, como en el resto de las rutas por negocio.
   */
  async businessExists(businessId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    return row !== undefined;
  }

  /**
   * EL HECHO: qué rol tiene quien llama en este negocio ahora mismo.
   *
   * No contesta «¿puedo?»: contesta el rol, y cada llamador dice sobre ese
   * hecho lo que exige. El predicado vive en
   * `apps/api/src/database/business-membership.ts` —membresía viva, sesión
   * dentro de la promesa del §5.2— y esta API lo pregunta en vez de
   * reimplementarlo.
   */
  async roleOf(
    businessId: string,
    userId: string,
  ): Promise<BusinessMemberRole | null> {
    return membershipRole(this.db, businessId, userId);
  }

  /**
   * La fila VIVA del negocio, leída PARA ESCRIBIR ENCIMA.
   *
   * ─── POR QUÉ `for update` Y NO UN `SELECT` DE SANGRÍA ─────────────────────────
   *
   * Porque la lectura y la escritura tienen que ser UNA cosa: el `from` del
   * log es el valor que la escritura sobrescribió, y sin el candado el segundo
   * escritor leería el plan que había antes de que el primero escribiera.
   *
   * `for update` hace que el segundo escritor ESPERE a que el primero suelte
   * la fila, y entonces lee el plan que el primero dejó. Y sólo se leen las
   * columnas de la suscripción —sin `LEFT JOIN` al catálogo— porque un
   * `for update` sobre el lado nullable de una unión exterior no es una
   * consulta que Postgres acepte.
   */
  async findLiveSubscriptionForUpdate(
    executor: SubscriptionsDbExecutor,
    businessId: string,
  ): Promise<SubscriptionRow | null> {
    const [row] = await executor
      .select()
      .from(subscriptions)
      .where(liveSubscription(businessId))
      .for('update')
      .limit(1);
    return row ?? null;
  }

  /**
   * Cambia el plan de la fila VIVA del negocio.
   *
   * ─── POR QUÉ EL `WHERE` ES UN SUBSELECT Y NO UN `id` ─────────────────────────
   *
   * El patrón que fijan las specs es
   * `where id = (select id from public.subscriptions where business_id = … and
   * cancelled_at is null and deleted_at is null)`: la fila que se toca es LA
   * VIVA, y se localiza en el momento de la escritura. Un `id` leído antes
   * podría ser el de una fila que se canceló entre la lectura y la escritura, y
   * el update tocaría una fila que ya no concede nada — o no tocaría nada y
   * devolvería un 200 que finge haber guardado el plan.
   *
   * ─── POR QUÉ NO SE MANDA `updated_at` ───────────────────────────────────────
   *
   * Porque lo mantiene un trigger de la base —`set_subscriptions_updated_at`,
   * sobre `public.handle_updated_at()`— y la aplicación que mandara una fecha
   * a mano estaría escribiendo una verdad que el trigger corrige después. La
   * misma regla aplica al `insert`: `created_at` y `started_at` son defaults
   * de la base.
   */
  async updateLiveSubscription(
    executor: SubscriptionsDbExecutor,
    businessId: string,
    planCode: BusinessPlanCode,
  ): Promise<SubscriptionRow | null> {
    const [row] = await executor
      .update(subscriptions)
      .set({ plan_code: planCode })
      .where(
        sql`${subscriptions.id} = (select s.id from ${subscriptions} s where s.business_id = ${businessId} and s.cancelled_at is null and s.deleted_at is null)`,
      )
      .returning();
    return row ?? null;
  }

  /**
   * Inserta la suscripción de un negocio que no tiene fila.
   *
   * Sólo `business_id` y `plan_code`: el `id`, el `created_at`, el
   * `started_at` y el `updated_at` son de la base —defaults y trigger— y
   * mandarlos desde acá sería escribir fechas que la base corrige.
   *
   * El `user_id` no se manda porque la fila es de un NEGOCIO, y el CHECK
   * `(business_id is not null) <> (user_id is not null)` exige exactamente un
   * sujeto.
   */
  async insertBusinessSubscription(
    executor: SubscriptionsDbExecutor,
    businessId: string,
    planCode: BusinessPlanCode,
  ): Promise<SubscriptionRow> {
    const [row] = await executor
      .insert(subscriptions)
      .values({ business_id: businessId, plan_code: planCode })
      .returning();
    if (!row) {
      throw new Error('subscriptions insert returned no row');
    }
    return row;
  }

  /**
   * Las filas del catálogo, agrupadas por plan.
   *
   * La consulta devuelve UNA FILA POR FEATURE —el `LEFT JOIN` con
   * `subscription_plan_features` multiplica la fila del plan— y el plan es una
   * fila con su lista. La lista se ordena por la columna, no por el orden en
   * que la base las devolvió: la respuesta tiene que ser la misma siempre.
   */
  private groupPlans(
    rows: Array<{
      code: BusinessPlanCode;
      audience: PlanAudience;
      max_locations: number | null;
      max_members: number | null;
      is_active: boolean;
      feature: BusinessFeature | null;
    }>,
  ): PlanEntry[] {
    const byCode = new Map<BusinessPlanCode, PlanEntry>();
    for (const row of rows) {
      const plan = byCode.get(row.code);
      const features = row.feature === null ? [] : [row.feature];
      if (plan) {
        plan.features.push(...features);
        continue;
      }
      byCode.set(row.code, {
        code: row.code,
        audience: row.audience,
        max_locations: row.max_locations,
        max_members: row.max_members,
        is_active: row.is_active,
        features,
      });
    }
    return [...byCode.values()];
  }
}
