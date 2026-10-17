/**
 * Por qué una sesión de panel no puede operar, en código.
 *
 * ─── LA ENUMERACIÓN VIVE EN LA BASE, Y NO EN UN TIPO DE POSTGRES ─────────────
 *
 * Los seis valores son literales de texto dentro del cuerpo de
 * `public.business_member_session_state()`, el RPC que el §5.2 expone para que
 * el panel **explique la salida en vez de mostrar un error genérico**. No son un
 * `enum` de Postgres: son seis cadenas que un `plpgsql` devuelve dentro de un
 * `jsonb_build_object`. Nada en la base obliga a que dos cosas coincidan, y nada
 * avisa cuando dejan de coincidir.
 *
 * ─── SI LA BASE GANA UN SÉPTIMO VALOR, EL QUE ESTÁ MAL ESTE ARCHIVO ──────────
 *
 * Ésa es la regla, y va escrita porque la tentación va a ser la contraria: si
 * `business_member_session_state()` empieza a devolver un valor que no está acá,
 * lo que hay que tocar es esta lista, no el schema para que deje de quejarse. Un
 * `z.enum` reducido se queda en verde y descarta el valor desconocido en
 * silencio —`role` pasa a `null` y el panel muestra «te pausaron» a quien en
 * realidad tiene otro problema—, y eso es peor que un 500. La enumeración es de
 * la base; este archivo es su copia, y una copia se actualiza.
 *
 * ─── QUÉ SIGNIFICA CADA VALOR PARA LOS CAMPOS DE AL LADO ─────────────────────
 *
 * `disabled`, `no_membership` y `multiple_businesses` devuelven `role: null` y
 * `location_ids` vacío: a una membresía revocada no se le devuelve su rol para
 * que el panel pinte un mensaje, y a quien tiene más de un negocio no se le
 * elige el suyo —el §9.3 dice que el panel pregunta cuál, y por eso
 * `business_ids` trae la lista. `expires_at` es `null` cuando no hay fecha que
 * mostrar, que son tres casos distintos y ninguno es «venció»: TTL apagado
 * (`0`), membresía nunca sellada (`session_never_stamped`), y las tres salidas
 * sin membresía.
 */
export const STAFF_SESSION_REASONS = [
	"ok",
	"no_membership",
	"multiple_businesses",
	"disabled",
	"session_expired",
	"session_never_stamped",
] as const;

export type StaffSessionReason = (typeof STAFF_SESSION_REASONS)[number];

export const StaffSessionReason = {
	OK: "ok",
	NO_MEMBERSHIP: "no_membership",
	MULTIPLE_BUSINESSES: "multiple_businesses",
	DISABLED: "disabled",
	SESSION_EXPIRED: "session_expired",
	SESSION_NEVER_STAMPED: "session_never_stamped",
} as const satisfies Record<string, StaffSessionReason>;
