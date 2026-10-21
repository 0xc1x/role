import type {
  BusinessPlanCode,
  BusinessSubscriptionDto,
  SubscriptionPlanDto,
} from '@0xc1x/role-commons';
import type { PlanEntry } from './subscriptions.repository';

/**
 * El catálogo y la suscripción → los contratos de `packages/commons`.
 *
 * ─── POR QUÉ HACE FALTA UN MAPPER Y NO BASTA CON SELECCIONAR ──────────────────
 *
 * Por tres razones, y las tres son de forma y no de gusto:
 *
 *  1. La suscripción tiene su `plan_code` y el catálogo tiene sus límites y
 *     sus features: la respuesta del contrato junta las dos mitades en una
 *     sola cabeza, y la unión esa es del DOMINIO, no de la base.
 *  2. `limits` es un objeto en el contrato y dos columnas en la tabla: sin el
 *     mapper la fila cruda no cumple el contrato, y el AGENTS de `apps/api` es
 *     explícito en que por la API no sale una fila de base de datos sin pasar
 *     por uno.
 *  3. Las fechas salen como ISO porque `TimestamptzSchema` es `z.string()`.
 *
 * ─── Y POR QUÉ NO HAY NADA QUE DECIDIR ACÁ ────────────────────────────────────
 *
 * Los límites y las features se COPIAN de la fila del catálogo. No se
 * consultan, no se recalculan y no se completan con un `null` «por si acaso»:
 * esta capa traduce forma, y la única decisión que tiene es la del `since`
 * que no existe —una suscripción sin fila no tiene fecha, y `null` es esa
 * respuesta—.
 */
export class SubscriptionsMapper {
  /**
   * Un plan del catálogo → el plan del contrato.
   */
  static toPlanDto(plan: PlanEntry): SubscriptionPlanDto {
    return {
      code: plan.code,
      audience: plan.audience,
      limits: {
        max_locations: plan.max_locations,
        max_members: plan.max_members,
      },
      features: [...plan.features],
    };
  }

  /**
   * La suscripción de un negocio → la suscripción del contrato.
   *
   * `plan` es la fila del CATÁLOGO y `planCode` el de la SUSCRIPCIÓN, y son
   * dos campos y no uno porque son dos hechos: la suscripción dice qué plan
   * tiene el negocio y el catálogo dice qué incluye ese plan.
   */
  static toSubscriptionDto(
    businessId: string,
    planCode: BusinessPlanCode,
    since: Date | null,
    plan: PlanEntry,
  ): BusinessSubscriptionDto {
    return {
      business_id: businessId,
      plan_code: planCode,
      since: since?.toISOString() ?? null,
      limits: {
        max_locations: plan.max_locations,
        max_members: plan.max_members,
      },
      features: [...plan.features],
    };
  }
}
