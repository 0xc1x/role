/**
 * El catálogo de planes del §4.5, en código.
 *
 * ─── POR QUÉ VIVE AQUÍ Y NO EN UNA TABLA ─────────────────────────────────────
 *
 * Un feature es una línea y un typecheck; un tier es una entrada más. Cuando
 * existan precios, suscripciones reales o tiers por tamaño, esto se mueve a
 * tablas — con el negocio ya diciendo qué necesita, no antes.
 *
 * ─── POR QUÉ ESTOS NÚMEROS SON UNA SEGUNDA COPIA, Y CÓMO SE SABE ─────────────
 *
 * La otra copia está en dos triggers de Postgres,
 * `enforce_business_location_limit` y `enforce_business_member_limit`, cada uno
 * con su `case v_plan` escrito a mano. El dueño ve un número en el panel y el
 * motor aplica un número en la base: si divergen, se le está mintiendo, y la
 * mentira no se ve hasta que alguien llega al tope.
 *
 * Por eso la comparación no es una nota: `plan-limits.db.spec.ts` en
 * `apps/api/src/database/security/` lee los límites y las features del
 * `pg_proc` VIVO y los compara con este archivo, celda por celda. Si alguien
 * agrega un plan aquí y no al trigger —o al revés— ese spec se pone rojo.
 *
 * ─── LOS DOS TOPES SON ACUMULATIVOS, Y EL DUEÑO NO CUENTA ────────────────────
 *
 * Un plan `pro` admite hasta 5 sucursales Y hasta 20 miembros; exceder
 * cualquiera de los dos bloquea el crecimiento. `members` cuenta solo filas con
 * `role <> 'owner'`: el dueño nunca consume cupo, y el trigger filtra igual que
 * estas constantes.
 *
 * `null` es «este plan no tiene tope», no «este tope no se ha decidido todavía».
 * La diferencia la defiende el trigger: su `case` tiene un `else` que levanta
 * excepción, así que un plan sin fila en este archivo no cae en `null` por
 * accidente.
 */

export const BUSINESS_PLAN_CODES = ["free", "pro", "pro_plus"] as const;

export type BusinessPlanCode = (typeof BUSINESS_PLAN_CODES)[number];

export const BusinessPlanCode = {
	FREE: "free",
	PRO: "pro",
	PRO_PLUS: "pro_plus",
} as const satisfies Record<string, BusinessPlanCode>;

/**
 * Las features de `public.business_feature`. El enum existe; el comportamiento
 * de `visibility_plus`, todavía no (§12, fuera de alcance).
 */
export const BUSINESS_FEATURES = [
	"staff_access",
	"payments",
	"visibility_plus",
] as const;

export type BusinessFeature = (typeof BUSINESS_FEATURES)[number];

export const BusinessFeature = {
	STAFF_ACCESS: "staff_access",
	PAYMENTS: "payments",
	VISIBILITY_PLUS: "visibility_plus",
} as const satisfies Record<string, BusinessFeature>;

export type BusinessPlanLimits = {
	locations: number | null;
	members: number | null;
};

export const BUSINESS_PLAN_LIMITS = {
	free: { locations: 1, members: 2 },
	pro: { locations: 5, members: 20 },
	pro_plus: { locations: null, members: null },
} as const satisfies Record<BusinessPlanCode, BusinessPlanLimits>;

export const BUSINESS_PLAN_FEATURES = {
	free: ["staff_access"],
	pro: ["staff_access", "payments"],
	pro_plus: ["staff_access", "payments", "visibility_plus"],
} as const satisfies Record<BusinessPlanCode, readonly BusinessFeature[]>;
