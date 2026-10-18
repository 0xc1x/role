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
 *
 * ─── NO NORMALIZA LA MAYÚSCULA, Y ESO TAMBIÉN ES UNA DECISIÓN ──────────────────
 *
 * `z.email()` acepta `Caja@Acme.com` y `CAJA@ACME.COM`, y las dos entran: el
 * schema no baja la caja, porque la columna espeja `auth.users.email` —que
 * GoTrue también trata sin distinguir mayúsculas— y un `toLowerCase()` aplicado
 * en el contrato guardaría una cosa distinta de la que el dueño escribió, sin que
 * nadie lo pidiera.
 *
 * La unicidad sí distingue: `business_members_alias_key` es UNIQUE sobre
 * `(business_id, lower(alias))`, así que dos alias que sólo se diferencian en la
 * caja son el MISMO alias para la base y se rechazan ahí, con un
 * `23505 business_members_alias_key`. Quien mapea ese código a la respuesta
 * limpia es el servicio, no este schema —y por eso hay un test que dice que las
 * dos variantes son entradas válidas, para que nadie lea «aceptado» como «libre».
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
 * ¿Este alias es una cuenta de equipo de Rolé —la que la UI reconoce como
 * «negocio»—?
 *
 * Es la condición que el §3.1 fija como SUFIJO, no como formato: la UI la usa
 * para el «¿olvvidaste tu contraseña?» del §9.1 y para el texto de «pide a tu
 * dueño que rote tu PIN».
 *
 * ─── EL ÁPICE FALLA HACIA AFUERA, Y POR QUÉ ──────────────────────────────────
 *
 * `x@role.ec` pelado NO es una cuenta de Rolé: la regla del §3.1 es literalmente
 * el sufijo `.role.ec`, así que hace falta un subdominio. Para el aviso del §9.4
 * eso no es un defecto sino lo correcto, porque el ápice sí recibe correo de
 * verdad —`notificaciones@role.ec` y `negocios@role.ec` son buzones vivos—: el
 * aviso no es ni falso ni innecesario.
 *
 * ─── Y EL LECTOR EQUIVOCADO DE ESTA FUNCIÓN ES UN BUG DE SEGURIDAD ─────────────
 *
 * **La Task 5 no puede usar esta función para bloquear el correo.** Recipiente y
 * entregable son preguntas al revés: ella necesita «¿esta dirección recibe
 * mensajes de verdad?», y esta función contesta «¿es una cuenta de equipo de
 * Rolé?». Para el ápice las dos respuestas son distintas, y esta falla en la
 * dirección que importa: `false` sobre una dirección que SÍ recibe correo deja
 * pasar un `change-email` o un `forgot-password` que el §8 quiere bloquear. Un
 * `isDeliverableAlias()` escrito para esa pregunta tiene que tratar el ápice
 * como lo que es; usar esta función ahí es un agujero con forma de refactor.
 *
 * La comparación es sobre el dominio y en minúsculas: `x@a.role.ec` es de Rolé y
 * `X@A.ROLE.EC` también, porque el dominio de un correo no distingue mayúsculas.
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
 * Lo que se edita acá es el rol, las sucursales y la política de sesión, que es
 * exactamente lo que el §8 pone en la columna «Qué hace» de esta ruta. NO están
 * `status`, `alias` ni `label`, y en los tres casos es una omisión y no un
 * olvido:
 *
 *   - `status` tiene su par de rutas (`disable` / `enable`) porque desactivar es
 *     una operación distinta de editar, y su efecto —ban al `auth.users`, sesiones
 *     abiertas incluidas— no es un campo que se pueda cambiar por accidente. Que
 *     no sea un campo tampoco impide la operación: impide que un `PATCH` la haga
 *     de rebote.
 *   - `alias` tiene su ruta porque cambiarlo cambia `auth.users.email` y trae el
 *     aviso del §9.4, que es un dato que hay que devolver, no un campo que se
 *     pueda perder.
 *   - `label` es el nombre con el que el dueño lo presentó, y ninguna de las nueve
 *     rutas del §8 lo renombra: la lista de acciones del §9.2 —rotar, cambiar
 *     sucursales, cambiar rol, editar alias, pausar, reactivar, eliminar— tampoco.
 *     Un campo editable aquí sería una primera puerta por donde entra un cambio de
 *     nombre que ningún cliente pidió. Agregarlo después es aditivo y no rompe
 *     nada; inventarlo ahora afirma una capacidad que el §8 no describe.
 *
 * `.strict()` por el motivo de `email.schema.ts`: sin él, un `PATCH` con
 * `status` dentro devuelve un 200 que aparenta haber pausado a alguien y no lo
 * hizo. Un 400 dice la verdad.
 */
export const UpdateBusinessMemberSchema = z
	.object({
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
 *
 * ─── Y POR QUÉ `.optional()` A PESAR DE `strictObject` ────────────────────────
 *
 * Por el cuerpo ausente, que NO es `{}`: medido en el stack real de Nest
 * (Express 5 + `body-parser`), un `POST` sin cuerpo deja `req.body` como
 * `undefined`, y `strictObject({}).safeParse(undefined)` falla con «expected
 * object, received undefined». Sin este `.optional()`, la llamada más natural que
 * puede hacer un cliente —rotar, que no tiene nada que mandar— sería un 400.
 *
 * `.optional()` no afloja nada de lo anterior: sigue rechazando `{ pin }` y
 * cualquier otra clave, y ahora además acepta la ausencia, que es lo mismo que
 * el objeto vacío. Lo que el schema sigue GANANDO es que un cliente no pueda
 * elegir el PIN.
 */
export const RotateBusinessMemberPinSchema = z.strictObject({}).optional();

/**
 * La tarjeta de entrega de `POST …/staff` y de `POST …/:memberId/rotate`.
 *
 * Es la ÚNICA respuesta de estas rutas que lleva el PIN (§8), y por eso se
 * declara como schema y no se vuelve a armar en el controlador: que el PIN
 * aparezca en otro lado es un hecho que se puede assertar.
 *
 * El PIN son seis dígitos porque el §3.1 dice seis, y es la cuenta del API lo
 * que hay que cambiar si algún día son otro número —no el schema en silencio.
 *
 * Y el ancho es un hecho COMPARTIDO, no local: `LoginRequestSchema.password` es
 * `z.string().min(6)` y el piso de GoTrue también es 6. Un PIN de cinco dígitos
 * pasaría este schema y fallaría en el login, en el cliente y con un error que
 * no señala el ancho. Los tres tienen que moverse juntos, que es una razón más
 * para que la cuenta viva acá y no repartida en tres archivos.
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
