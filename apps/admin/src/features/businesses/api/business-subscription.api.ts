import {
	BusinessSubscriptionSchema,
	SubscriptionPlanSchema,
	type UpdateBusinessSubscriptionDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";

/**
 * El catálogo de planes y la suscripción del negocio, para el panel.
 *
 * ─── POR QUÉ LA SUSCRIPCIÓN SE LEE CON SUS LÍMITES Y SUS FEATURES ───────────
 *
 * Porque la respuesta trae los límites y las features DEL CATÁLOGO, no los de
 * la fila: el panel pinta el mismo número que el motor aplica. Si el panel
 * tradujera una forma en otra, habría dos verdades —la que se ve y la que se
 * corta— y el operador decidiría sobre la que se ve.
 *
 * ─── Y POR QUÉ LAS TRES RESPUESTAS SE PARSEAN ─────────────────────────────────
 *
 * Porque lo que este panel muestra son NÚMEROS que el motor aplica: un tope
 * que llega con otra forma se pintaría como un número, y el operador leería un
 * límite que el motor no está aplicando. Parseando con el schema de `commons`,
 * una deriva del servidor rompe en voz alta —y el panel dice POR QUÉ— en vez de
 * mentir con calma. Es la misma regla que sigue el corte del equipo.
 *
 * ─── Y POR QUÉ EL CUERPO DEL CAMBIO SÓLO LLEVA EL CÓDIGO ─────────────────────
 *
 * Porque el plan es lo único que decide QUIEN ASIGNA el plan —la plataforma—:
 * los límites y las features salen del catálogo, y mandarlos en el cuerpo
 * sería dejar que el cliente se escribiera el número que el motor aplica.
 *
 * ─── POR QUÉ NO HAY PRECIO AQUÍ ──────────────────────────────────────────────
 *
 * Porque no hay ninguno: el plan se asigna a mano, sin pasarela y sin
 * renovación. Un panel que prometiera un cobro sería un panel mintiendo.
 */
export const businessSubscriptionApi = {
	/**
	 * `GET /businesses/:businessId/subscription`: el plan del negocio.
	 *
	 * Un negocio sin suscripción se lee `free` con `since: null`: el `coalesce`
	 * de la base y esta respuesta son la misma cosa.
	 */
	get: async (businessId: string) =>
		BusinessSubscriptionSchema.parse(
			await api.get<unknown>(`/businesses/${businessId}/subscription`),
		),
	/**
	 * `PATCH /businesses/:businessId/subscription`: la plataforma asigna el plan.
	 *
	 * Un plan fuera del catálogo —o retirado de la oferta— es un 422 con
	 * «Ese plan no existe.», y el panel lo avisa con su `requestId`.
	 */
	update: async (businessId: string, body: UpdateBusinessSubscriptionDto) =>
		BusinessSubscriptionSchema.parse(
			await api.patch<unknown>(`/businesses/${businessId}/subscription`, body),
		),
	/**
	 * `GET /plans`: el catálogo, con los límites y las features de cada plan.
	 *
	 * Sólo trae los planes EN OFERTA: un plan retirado no se ofrece, y una lista
	 * que lo ofreciera haría que el panel propusiera algo que la API va a
	 * rechazar con un 422.
	 */
	plans: async () =>
		SubscriptionPlanSchema.array().parse(await api.get<unknown>("/plans")),
};
