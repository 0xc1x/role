import { z } from "zod";
import { BUSINESS_FEATURES, BUSINESS_PLAN_CODES } from "../enums/business-plan";
import { PLAN_AUDIENCES } from "../enums/plan-audience";

/**
 * El código de un plan, en el vocabulario del §4.5.
 *
 * ─── POR QUÉ ESTE SCHEMA EXISTE AHORA Y NO ANTES ─────────────────────────────
 *
 * El enum `public.business_plan_code` de Postgres y la lista de este paquete son
 * la misma palabra escrita dos veces —el motor compara contra la de la base— y
 * hasta ahora no había ruta que aceptara un `plan_code` en un cuerpo, así que
 * nadie tenía que validarlo. La ruta que sí lo acepta —la que cambia el plan
 * de un negocio— necesita un vocabulario y no un string pelado: un código que
 * existe en el catálogo pero no en la base es un 422 del servicio, y uno que no
 * existe en ninguno de los dos es un 400 aquí, que es más barato y más claro.
 */
export const BusinessPlanCodeSchema = z.enum(BUSINESS_PLAN_CODES);

/**
 * Una feature del plan, del enum `public.business_feature`.
 *
 * La lista es la del enum de Postgres: el motor compara contra ella, así que
 * una feature traducida o inventada no activa nada y sólo produce un error
 * tardío.
 */
export const BusinessFeatureSchema = z.enum(BUSINESS_FEATURES);

/**
 * La audiencia de un plan: `business` o `consumer`.
 */
export const PlanAudienceSchema = z.enum(PLAN_AUDIENCES);

/**
 * Los topes de un plan: cuántas sucursales y cuántos miembros admite.
 *
 * ─── `null` ES «SIN TOPE», Y `0` NO ES «SIN TOPE» ───────────────────────────
 *
 * `null` es lo que dice `pro_plus`: no hay tope. `0` sería «ni una sucursal»,
 * que es un plan que no deja crecer nada —y ningún plan del §4.5 lo dice—. Por
 * eso el límite es `positive()` y no `nonnegative()`: el hueco entre «sin tope»
 * y «con tope» tiene que ser un hueco, y el `0` es un tope más.
 *
 * ─── POR QUÉ LAS COLUMNAS SE LLAMAN `max_*` ─────────────────────────────────
 *
 * `max_locations` y `max_members` son los nombres de las columnas del catálogo,
 * y este schema es la forma de esa fila por el cable: el panel pinta lo que
 * dice la columna y el motor aplica lo que dice la columna. Los límites del
 * espejo de este paquete (`BUSINESS_PLAN_LIMITS`) se llaman `locations` y
 * `members` porque nacieron antes que la tabla, y el guard compara las dos
 * formas celda por celda.
 *
 * ─── POR QUÉ `.strict()` ─────────────────────────────────────────────────────
 *
 * Un tope que no es un tope es un dato que no debería viajar: sin `strict`, zod
 * lo descarta en silencio y el panel muestra un número que nadie pidió. Con
 * `strict` es un 400.
 */
export const SubscriptionLimitsSchema = z
	.object({
		max_locations: z.number().int().positive().nullable(),
		max_members: z.number().int().positive().nullable(),
	})
	.strict();

/**
 * Un plan del catálogo, tal como lo lee el panel.
 *
 * ─── POR QUÉ EL PLAN Y LA SUSCRIPCIÓN TIENEN LA MISMA FORMA ─────────────────
 *
 * El panel muestra el plan de un negocio y el catálogo completo, y los dos
 * objetos tienen los MISMOS campos de límites y de features: si no, el panel
 * tendría que traducir de un dialecto a otro según de dónde venga el dato, y
 * dos dialectos son dos verdades —el número que se ve y el que se aplica—.
 * Por eso los dos schemas usan `SubscriptionLimitsSchema` y no dos schemas
 * parecidos.
 *
 * `.strict()` por el mismo motivo que en los límites: una clave de más es una
 * columna que este contrato no tiene, y una columna que este contrato no tiene
 * es una promesa que alguien espera.
 */
export const SubscriptionPlanSchema = z
	.object({
		code: BusinessPlanCodeSchema,
		audience: PlanAudienceSchema,
		limits: SubscriptionLimitsSchema,
		features: z.array(BusinessFeatureSchema),
	})
	.strict();
