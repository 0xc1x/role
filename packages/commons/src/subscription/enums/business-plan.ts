/**
 * El catálogo de planes del §4.5, tipado.
 *
 * ─── POR QUÉ ESTE ARCHIVO YA NO ES LA FUENTE ────────────────────────────────
 *
 * Un feature es una línea y un typecheck; un tier es una entrada más. Eso fue
 * el motivo de que el catálogo viviera en código mientras no hubiera precios,
 * suscripciones reales ni tiers por tamaño. Ese día llegó: el catálogo se mudó
 * a tablas —`subscription_plans` y `subscription_plan_features`— y la fila es
 * la fuente. Este archivo queda como el ESPEJO TIPADO de esas tablas: el
 * vocabulario que el compilador conoce, para que ningún consumidor escriba
 * `plan_code` a mano y para que el panel y la API lean la misma lista.
 *
 * ─── POR QUÉ ESTOS NÚMEROS SON UNA SEGUNDA COPIA, Y CÓMO SE SABE ─────────────
 *
 * La otra copia está en la tabla del catálogo, una fila por plan. El dueño ve un
 * número en el panel y el motor aplica un número en la base: si divergen, se le
 * está mintiendo, y la mentira no se ve hasta que alguien llega al tope.
 *
 * Por eso la comparación no es una nota: el guard de
 * `apps/api/src/database/security/` lee el catálogo VIVO y lo compara con este
 * archivo, celda por celda. Si alguien agrega un plan aquí y no a la tabla —o
 * al revés— ese spec se pone rojo.
 *
 * ─── LOS DOS TOPES SON ACUMULATIVOS, Y EL DUEÑO NO CUENTA ────────────────────
 *
 * Un plan `pro` admite hasta 5 sucursales Y hasta 20 miembros; exceder
 * cualquiera de los dos bloquea el crecimiento. `members` cuenta solo filas con
 * `role <> 'owner'`: el dueño nunca consume cupo, y el trigger filtra igual que
 * estas constantes.
 *
 * `null` es «este plan no tiene tope», no «este tope no se ha decidido todavía».
 * La diferencia la defienden dos cosas: el CHECK de la tabla, que prohíbe el
 * `0` como tope, y el motor, que levanta excepción en vez de caer en `null`
 * cuando no resuelve el plan. Un plan sin fila no puede salirse por el hueco
 * del «sin tope».
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
