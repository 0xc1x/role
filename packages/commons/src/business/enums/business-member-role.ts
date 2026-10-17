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

/**
 * Los roles que un `POST /staff` OFRECE. Es un subconjunto de
 * {@link BUSINESS_MEMBER_ROLES} y por eso vive al lado y no en otro archivo: la
 * diferencia entre el vocabulario entero y el ofertable es la regla del §5.4, y
 * una regla que se lee en un solo lugar se sostiene; en tres —el `422` del
 * servicio, el `select` del admin y el índice único de la base— es tres
 * enunciados que se pueden apartar.
 *
 * ─── POR QUÉ `owner` NO SE OFRECE ─────────────────────────────────────────────
 *
 * Ninguna de las nueve rutas del §8 transfiere la propiedad de un negocio a otra
 * persona, y el §5.4 saca esa transferencia de la v1. Crear un dueño por el alta
 * de un empleado produciría un segundo dueño y rebotaría con
 * `23505 business_members_one_owner_per_business`, que es un error de índice y no
 * una respuesta que un dueño pueda entender.
 *
 * ─── POR QUÉ EL ALTA SIGUE SIENDO PERMISIVA ───────────────────────────────────
 *
 * `CreateBusinessMemberSchema` acepta el vocabulario entero y NO se recorta con
 * este array, a propósito: el plan pide que lo rechace la capa de servicio con un
 * **422**, y un schema que lo rechazara devolvería un 400 —que es otra cosa, con
 * otro significado para el cliente— y dejaría al servicio sin un caso que
 * probar. Este array no es la defensa: es lo que el formulario tiene que ofrecer,
 * y su trabajo es que el dueño no llene un formulario para descubrir un 422.
 *
 * Lo mismo vale para `UpdateBusinessMemberSchema.role`, y por el mismo motivo:
 * ningún formulario debe ofrecer `owner` ni en el alta ni en la edición. Los dos
 * schemas siguen siendo PERMISIVOS con el vocabulario entero, y no es descuido: el
 * corte es una regla de negocio —un segundo dueño es un `23505` y una promoción no
 * tiene ruta en el §8— y cortarlo en el schema devolvería un 400 y dejaría al
 * servicio sin el caso que probar.
 */
export const CREATABLE_BUSINESS_MEMBER_ROLES = [
	"manager",
	"staff",
] as const satisfies readonly BusinessMemberRole[];
