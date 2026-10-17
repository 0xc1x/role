/**
 * Los roles dentro de un negocio, en código.
 *
 * ─── POR QUÉ ESTO ES UNA COPIA Y CÓMO SE SABE ─────────────────────────────────
 *
 * La otra copia está en Postgres, en la primera migración del Plan 1:
 *
 *     create type public.business_member_role as enum ('owner', 'manager', 'staff');
 *
 * Y entre dos copias no hay nada que las ate, salvo desde este mes:
 * `business-member-vocabulary.db.spec.ts`, en
 * `apps/api/src/database/security/`, lee `pg_enum` de la base VIVA y compara este
 * archivo contra ella en las dos direcciones. Borrar `manager` de acá rompe las
 * Tasks 3 y 4 del Plan 2 sin que se ponga rojo nada; borrarlo de la base deja a
 * la API escribiendo un valor que la columna no puede guardar, y eso tampoco se
 * pone rojo hasta que alguien da de alta a un gerente.
 *
 * ─── EL ORDEN ES DE AUTORIDAD, Y LA BASE NO LO SABE ──────────────────────────
 *
 * El array va de `owner` a `staff` porque ése es el orden de autoridad: el §9.3
 * filtra las secciones del panel por rol mínimo, y `owner` puede todo lo que
 * puede `manager`, que puede todo lo que puede `staff`. Pero `pg_enum` no
 * ordena nada —`business_member_role()` devuelve el rol guardado, y ninguna
 * función lo ordena— así que ese orden es una convención de este archivo, no un
 * dato. Nada debe inferir una comparación de roles de acá sin escribirla.
 *
 * ─── `owner` NO ES UNA ELECCIÓN LIBRE, Y ESO NO ES DE ESTE ARCHIVO ───────────
 *
 * La base lo hace cumplir: `business_members_one_owner_per_business` admite un
 * dueño vivo por negocio, y `enforce_owner_is_untouchable` levanta `R0002` si
 * alguien lo desactiva o lo da de baja. Lo que este archivo no dice es que
 * `owner` se pueda crear por `POST /staff` —eso lo cierra el servicio con un
 * 422, porque un segundo dueño es un `23505` que nadie sabe leer— ni que el
 * negocio tenga SIEMPRE dueño: la degradación `owner → manager` está permitida a
 * propósito y el §5.4 saca la transferencia de propiedad de la v1. El
 * invariante es «un dueño vivo», no «un dueño».
 */
export const BUSINESS_MEMBER_ROLES = ["owner", "manager", "staff"] as const;

export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];

export const BusinessMemberRole = {
	OWNER: "owner",
	MANAGER: "manager",
	STAFF: "staff",
} as const satisfies Record<string, BusinessMemberRole>;
