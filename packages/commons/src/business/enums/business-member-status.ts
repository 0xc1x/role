/**
 * Si un acceso está en pie o pausado, en código.
 *
 * ─── POR QUÉ ES UNA COPIA Y CÓMO SE SABE ─────────────────────────────────────
 *
 * La otra copia es `create type public.business_member_status as enum ('active',
 * 'disabled')`, en la misma migración que los roles, y la ata el mismo guard:
 * `business-member-vocabulary.db.spec.ts` la lee de `pg_enum` y compara en las
 * dos direcciones.
 *
 * ─── `disabled` ES PAUSAR, Y BORRAR ES OTRA COSA ──────────────────────────────
 *
 * El §8 separa las dos operaciones y las dos tienen su propia ruta. Desactivar es
 * `status = 'disabled'` más un ban al `auth.users`, y mata TODAS las sesiones,
 * incluidas las persistentes de una tablet. Dar de baja es `deleted_at`, y deja
 * la fila: el alias no se recicla y el conteo de «quién estuvo aquí» sigue siendo
 * posible. Un dueño que rota el PIN creyendo que cortó el acceso es el peor
 * resultado posible de esta pantalla, y esa confusion empieza en una palabra.
 * Por eso `status` no es un campo de `UpdateBusinessMemberSchema`: desactivar y
 * reactivar son rutas propias, y el PIN tiene la suya.
 *
 * ─── NINGÚN MIEMBRO NACE PAUSADO ─────────────────────────────────────────────
 *
 * La columna nace `default 'active'` y ningún schema de alta de este paquete
 * acepta `status`. La única forma de tener una membresía pausada es pausarla, y
 * esa asimetría es intencional: un alta es un alta.
 */
export const BUSINESS_MEMBER_STATUSES = ["active", "disabled"] as const;

export type BusinessMemberStatus = (typeof BUSINESS_MEMBER_STATUSES)[number];

export const BusinessMemberStatus = {
	ACTIVE: "active",
	DISABLED: "disabled",
} as const satisfies Record<string, BusinessMemberStatus>;
