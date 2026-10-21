/**
 * A quién sirve un plan del catálogo.
 *
 * ─── POR QUÉ LA AUDIENCIA ES DEL PLAN Y NO DE LA SUSCRIPCIÓN ────────────────
 *
 * Un plan de negocio y un plan de consumidor son cosas distintas: topes
 * distintos, features distintas y quién puede contratarlos distinto. El sujeto
 * —el negocio o la persona— lo decide la suscripción; el plan sólo dice a qué
 * clase de sujeto sirve. Por eso la audiencia vive en el catálogo y no en la
 * fila de suscripción: cambiar de `free` a `pro` no cambia de audiencia.
 *
 * ─── `consumer` ESTÁ PERMITIDO, Y NO HAY NINGÚN PLAN DE CONSUMIDOR ───────────
 *
 * La tabla del catálogo admite las dos audiencias, pero hoy no se siembra
 * ningún plan de consumidor y no hay superficie que lo ofrezca. El valor está
 * porque la tabla lo admite —y admitirlo ahora evita una migración el día que
 * lo haya— y no porque exista: un plan de consumidor que nadie ofrece no se
 * inventa desde un schema.
 */
export const PLAN_AUDIENCES = ["business", "consumer"] as const;

export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

export const PlanAudience = {
	BUSINESS: "business",
	CONSUMER: "consumer",
} as const satisfies Record<string, PlanAudience>;
