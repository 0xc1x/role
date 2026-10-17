import { z } from "zod";
import {
	NonNegativeIntSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";
import { BUSINESS_MEMBER_ROLES } from "../enums/business-member-role";
import { BUSINESS_MEMBER_STATUSES } from "../enums/business-member-status";

export const BusinessMemberRoleSchema = z.enum(BUSINESS_MEMBER_ROLES);

export const BusinessMemberStatusSchema = z.enum(BUSINESS_MEMBER_STATUSES);

/**
 * El dominio de los alias que proporciona Rolé. No el único dominio válido: ver
 * {@link BusinessMemberAliasSchema}.
 */
export const ROLE_EC_DOMAIN = "role.ec";

/**
 * `business_members.alias`: el identificador con el que la persona entra.
 *
 * ─── ES UN CORREO, Y EL CORREO ES DE VERDAD ──────────────────────────────────
 *
 * La columna espeja `auth.users.email` y el §3.1 mete al empleado por el login que
 * ya existe: sin segunda puerta, sin switch, sin OTP. Por eso el validador es
 * `z.email()` y no un `@` pelado —es el mismo formato que GoTrue acepta al crear
 * el `auth.users`, y un alias que GoTrue no aceptaría produciría una alta que
 * falla en la base— y tampoco lleva `.max()`: la columna es `text` y los correos
 * largos son un hecho, no un error de dedo.
 *
 * ─── CUALQUIER DOMINIO ES LEGÍTIMO, Y POR ESO NO HAY ERROR ───────────────────
 *
 * El §9.4 deja el dominio editable a propósito: hay negocios que manejan correo
 * bajo su propio y `caja.centro@panaderialafamilia.ec` es lo que el empleado ya
 * tiene en la cabeza. Prohibirlo sería inventar una regla que el negocio no pidió,
 * y además equivocada: ese dominio SÍ recibe correo de verdad, así que el aviso
 * que devuelve la respuesta es información, no una disculpa por un rechazo.
 *
 * Lo que este schema NO hace —y es lo que se le pide que no haga— es codificar
 * «sólo `.role.ec` sirve». Ese valor es una convención de la plataforma para no
 * gastar la reputación de envío de un dominio ajeno (§3.1), no una restricción
 * del contrato. El aviso vive en `businessMemberAliasWarnings()`.
 */
export const BusinessMemberAliasSchema = z.email();

/**
 * La política de sesión de un acceso, en horas.
 *
 * ─── EL `0` ES «NO EXPIRA», Y POR ESO ESTÁ DENTRO ─────────────────────────────
 *
 * Este es el valor que hace la diferencia entre «equipo propio» y «por turnos»
 * (§9.2), así que su significado va dicho acá y no se deja a quien lee: `0` NO es
 * «venció ahora» ni «sin efecto hasta que se rellene». La base lo dice con
 * `business_member_session_expires_at(ttl, sello)`, que devuelve `NULL` cuando el
 * TTL es `0`: no hay fecha de vencimiento porque no hay vencimiento.
 *
 * Por eso la validación es `>= 0` y no `> 0`. Un schema que exigiera un número
 * positivo volvería inexpresable el modo que el §9.2 le ofrece al dueño, y uno
 * que aceptara el `0` sin decirlo dejaría al siguiente lector decidiendo si ese
 * cero es «sin expiración» o «una sesión que ya no vale». Las dos lecturas
 * producen sesiones distintas en el panel, y sólo una es la correcta.
 *
 * El rango es el `integer` de Postgres: `NonNegativeIntSchema` acota a int4, y
 * por eso un `2^31` es un 400 acá en vez de un 500 en la base.
 */
export const BusinessMemberSessionTtlHoursSchema = NonNegativeIntSchema;

/**
 * Los avisos que una respuesta de alta o de cambio de alias puede traer.
 *
 * No es un vocabulario de la base: no hay enum, ni CHECK, ni nada que lo ata al
 * motor. Vive acá porque la regla que decide cuándo se emite es de este paquete
 * —un dominio ajeno a `.role.ec` puede recibir correo de verdad— y porque el
 * §9.4 quiere que la UI pueda distinguir «te lo advierto» de «te lo rechacé» sin
 * inventar prosa en el servidor.
 */
export const STAFF_ALIAS_WARNING_CODES = [
	"alias_domain_can_receive_mail",
] as const;

export type StaffAliasWarningCode = (typeof STAFF_ALIAS_WARNING_CODES)[number];

export const StaffAliasWarningCodeSchema = z.enum(STAFF_ALIAS_WARNING_CODES);

/**
 * ¿Este alias es de una cuenta de negocio de Rolé?
 *
 * Es la condición que el §3.1 fija como SUFIJO, no como formato: la UI la usa
 * para el «¿olvvidaste tu contraseña?» del §9.1 y para el texto de «pide a tu
 * dueño que rote tu PIN». Un alias de dominio propio es una cuenta como otra y
 * tiene que poder usar el login normal.
 *
 * La comparación es sobre el dominio y en minúsculas: `x@a.role.ec` es de Rolé y
 * `X@A.ROLE.EC` también, porque el dominio de un correo no distingue mayúsculas.
 * Un `x@role.ec` pelado —sin subdominio— NO cuenta, porque la regla del §3.1 es
 * literalmente el sufijo `.role.ec`. El error posible es un aviso de más, que es
 * la dirección que no rompe nada.
 */
export function isRoleEcAlias(alias: string): boolean {
	const domain = alias.split("@")[1] ?? "";
	return domain.toLowerCase().endsWith(`.${ROLE_EC_DOMAIN}`);
}

/**
 * Los avisos que una respuesta de alta o de cambio de alias debe traer para este
 * alias.
 *
 * La lista se calcula acá y no se decide caso por caso en la API, para que el
 * aviso y el almacenamiento no puedan separarse: la respuesta dice «esto puede
 * recibir correo» SI Y SÓLO SI el alias que se acaba de guardar dice lo contrario.
 */
export function businessMemberAliasWarnings(
	alias: string,
): StaffAliasWarningCode[] {
	return isRoleEcAlias(alias) ? [] : ["alias_domain_can_receive_mail"];
}

/**
 * `public.business_members` tal como la ve el panel.
 *
 * Espejo de la fila con una diferencia, que es el alcance: `business_member_
 * locations` es tabla aparte (§4.1) y llega como el arreglo de ids que el §9.3
 * filtra por rol mínimo. Un alcance vacío es un dato, no una ausencia —es lo que
 * ve un `staff` sin sucursales— así que el arreglo es obligatorio y no opcional.
 *
 * `deleted_at` está porque la columna existe y el borrado es lógico: la lista
 * nunca lo trae, y un `null` aquí significa «vivo», que no es lo mismo que
 * «todavía no se sabe».
 */
export const BusinessMemberSchema = z.object({
	id: UuidSchema,
	business_id: UuidSchema,
	user_id: UuidSchema,
	role: BusinessMemberRoleSchema,
	label: z.string().min(1),
	alias: BusinessMemberAliasSchema,
	status: BusinessMemberStatusSchema,
	session_ttl_hours: BusinessMemberSessionTtlHoursSchema,
	business_location_ids: z.array(UuidSchema),
	last_authenticated_at: TimestamptzSchema.nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
	deleted_at: TimestamptzSchema.nullable(),
});

/**
 * `POST /businesses/:businessId/staff`.
 *
 * `business_id` NO está en el body: lo trae la ruta, y un body que pudiera
 * contradecir a la ruta es una puerta de atrás para dar de alta un acceso en otro
 * negocio. Por eso `.strict()` y no sólo el `omit()` que usa
 * `UpdateBusinessLocationSchema` — mandar `business_id` es un 400, no un 200 que
 * finge haber guardado lo que el cliente creía.
 *
 * `role` es opcional y cuando falta manda el `default 'staff'` de la columna, que
 * es la única copia de esa decisión: nadie escribe `'staff'` en un schema para
 * tener dos. `alias` es opcional por la misma razón de UX que en el §9.4 —el
 * sistema propone `{código}@{slug}.role.ec` y el dueño puede no escribir nada—
 * y `status` no aparece: nadie nace pausado.
 *
 * Que el vocabulario acepte `owner` no significa que la ruta lo cree. El `23505`
 * de `business_members_one_owner_per_business` es un error que nadie sabe leer,
 * así que el servicio lo cierra con un 422 antes de tocar la base; esa decisión es
 * suya y no cabe en un schema de formato.
 */
export const CreateBusinessMemberSchema = z
	.object({
		label: z.string().min(1),
		role: BusinessMemberRoleSchema.optional(),
		alias: BusinessMemberAliasSchema.optional(),
		session_ttl_hours: BusinessMemberSessionTtlHoursSchema.optional(),
		business_location_ids: z.array(UuidSchema),
	})
	.strict();

/**
 * `PATCH /businesses/:businessId/staff/:memberId`.
 *
 * Lo que se edita acá es el rol, las sucursales y la política de sesión. NO están
 * `status` ni `alias`, y no es una omisión:
 *
 *   - `status` tiene su par de rutas (`disable` / `enable`) porque desactivar es
 *     una operación distinta de editar, y su efecto —ban al `auth.users`, sesiones
 *     abiertas incluidas— no es un campo que se pueda cambiar por accidente. Que
 *     no sea un campo tampoco impide la operación: impide que un `PATCH` la haga
 *     de rebote.
 *   - `alias` tiene su ruta porque cambiarlo cambia `auth.users.email` y trae el
 *     aviso del §9.4, que es un dato que hay que devolver, no un campo que se
 *     pueda perder.
 *
 * `.strict()` por el motivo de `email.schema.ts`: sin él, un `PATCH` con
 * `status` dentro devuelve un 200 que aparenta haber pausado a alguien y no lo
 * hizo. Un 400 dice la verdad.
 */
export const UpdateBusinessMemberSchema = z
	.object({
		label: z.string().min(1).optional(),
		role: BusinessMemberRoleSchema.optional(),
		session_ttl_hours: BusinessMemberSessionTtlHoursSchema.optional(),
		business_location_ids: z.array(UuidSchema).optional(),
	})
	.strict();

/**
 * `PATCH /businesses/:businessId/staff/:memberId/alias`.
 *
 * Un solo campo, porque editar el alias cambia `auth.users.email` en la misma
 * operación y la respuesta tiene que poder decir si ese dominio recibe correo de
 * verdad (§8, §9.4).
 */
export const UpdateBusinessMemberAliasSchema = z
	.object({
		alias: BusinessMemberAliasSchema,
	})
	.strict();

/**
 * `POST /businesses/:businessId/staff/:memberId/rotate`.
 *
 * Un objeto vacío y `.strict()`, a propósito: el PIN lo genera el servidor con
 * `crypto.randomInt` y se entrega una sola vez, así que un body con un `pin`
 * adentro no es un dato que sobre —es una puerta de atrás para que el PIN lo
 * elija el cliente—. Sin `strict` el objeto de zod lo descarta en silencio y la
 * ruta responde un 200 con un PIN que nadie eligió; con `strict` es un 400.
 */
export const RotateBusinessMemberPinSchema = z.strictObject({});

/**
 * La tarjeta de entrega de `POST …/staff` y de `POST …/:memberId/rotate`.
 *
 * Es la ÚNICA respuesta de estas rutas que lleva el PIN (§8), y por eso se
 * declara como schema y no se vuelve a armar en el controlador: que el PIN
 * aparezca en otro lado es un hecho que se puede assertar.
 *
 * El PIN son seis dígitos porque el §3.1 dice seis, y es la cuenta del API lo
 * que hay que cambiar si algún día son otro número —no el schema en silencio.
 */
export const BusinessMemberDeliveryCardSchema = z
	.object({
		alias: BusinessMemberAliasSchema,
		pin: z.string().regex(/^\d{6}$/),
		alias_warnings: z.array(StaffAliasWarningCodeSchema),
	})
	.strict();

/**
 * La respuesta de `PATCH …/:memberId/alias`: la membresía en su estado nuevo y el
 * aviso del §9.4.
 *
 * `alias_warnings` es obligatorio y sin default a propósito: la lista vacía es
 * una decisión —«ese dominio no recibe correo»— y no una omisión de quien arman
 * la respuesta.
 */
export const UpdateBusinessMemberAliasResponseSchema = z
	.object({
		member: BusinessMemberSchema,
		alias_warnings: z.array(StaffAliasWarningCodeSchema),
	})
	.strict();
