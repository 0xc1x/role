import { z } from "zod";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";
import {
	BusinessFeatureSchema,
	BusinessPlanCodeSchema,
	SubscriptionLimitsSchema,
} from "./subscription-plan.schema";

/**
 * La suscripción de un negocio: qué plan tiene y desde cuándo.
 *
 * ─── POR QUÉ LOS LÍMITES Y LAS FEATURES VIENEN EN LA SUSCRIPCIÓN ───────────
 *
 * La fila de la suscripción guarda el `plan_code`; los límites y las features
 * son los del plan. Pero la respuesta que lee el panel los trae agrupados
 * aquí, con la MISMA forma que el plan suelto, para que el panel tenga una sola
 * cabeza: si la suscripción trajera los números con otro nombre, el panel
 * tendría que traducir según de dónde venga el dato, y una traducción es un
 * sitio donde el número puede cambiar de valor sin que nadie lo note.
 *
 * ─── POR QUÉ `since` PUEDE SER `null` ────────────────────────────────────────
 *
 * `null` es «todavía no hay suscripción»: el negocio se lee como `free` por el
 * `coalesce` y la fecha no existe porque la suscripción no existe. No es «la
 * suscripción existe pero no se sabe desde cuándo», que es un dato que la base
 * no puede tener.
 */
export const BusinessSubscriptionSchema = z
	.object({
		business_id: UuidSchema,
		plan_code: BusinessPlanCodeSchema,
		since: TimestamptzSchema.nullable(),
		limits: SubscriptionLimitsSchema,
		features: z.array(BusinessFeatureSchema),
	})
	.strict();

/**
 * `PATCH /businesses/:businessId/subscription`: cambiar el plan de un negocio.
 *
 * ─── POR QUÉ SOLO EL PLAN, Y NADA MÁS ───────────────────────────────────────
 *
 * El plan es lo único que decide quien ASIGNA el plan —el admin de plataforma—:
 * los límites y las features salen del catálogo, y mandarlos en el cuerpo sería
 * dejar que el cliente se escriba el número que el motor aplica. `.strict()`
 * convierte esa puerta de atrás en un 400 en vez de en un 200 que finge haber
 * guardado lo que el cliente creía.
 *
 * El `business_id` tampoco está: lo trae la ruta, y un body que pudiera
 * contradecirla es una puerta de atrás para cambiarle el plan a otro negocio.
 */
export const UpdateBusinessSubscriptionSchema = z.strictObject({
	plan_code: BusinessPlanCodeSchema,
});
