import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	AnnouncementSchema,
	UuidSchema,
	type Announcement,
} from "@0xc1x/role-commons";
import { z } from "zod";

import { AppError, Errors } from "@/src/core/error/app-error";
import { toAppError } from "@/src/core/error/mapper";
import { supabase } from "@/src/core/supabase/client";
import { useAuthStore } from "@/src/features/auth/store";

import {
	announcementAudience,
	localDismissalKey,
	MAX_LOCAL_DISMISSALS,
	type AnnouncementAudience,
} from "../domain/announcement";

/**
 * Lectura y escritura de los avisos del operador, directo a Supabase (ADR-0002:
 * RLS es la frontera, el API no intermedía al móvil).
 *
 * Lo que este archivo NO hace, y es la regla que lo gobierna: no decide a quién
 * le toca un aviso. La policy `Anyone reads the announcements they are eligible
 * for` resuelve los cinco términos —`active`, ventana, sesión, rol y
 * `user_ids`— y toda la lectura de acá confía en eso. Un `.eq("audience_kind",
 * …)` o un `active = true` en el cliente serían una segunda copia de la misma
 * regla, y de dos copias solo se corrige la que nadie mira.
 */

/**
 * Las columnas del select son las del CONTRATO de lectura, derivadas de él con
 * `Object.keys` y no escritas a mano: si commons agrega un campo, el select lo
 * trae solo, y como `AnnouncementSchema` NO incluye `user_ids` ni
 * `business_ids` —a propósito, son el camino de escritura— el select no puede
 * pedirlas ni aunque alguien las escriba en la lista. Mandarlas en el wire le
 * regalaría a cada dispositivo la lista de todos los demás que la locan.
 */
const COLUMNAS = Object.keys(AnnouncementSchema.shape).join(", ");

/** Fila de `announcement_acknowledgements`: solo el id del aviso. */
const acknowledgementRow = z.object({ announcement_id: UuidSchema });

/**
 * El cliente de Supabase no está tipado contra el esquema de la base, así que
 * `data` llega como `any`. El contrato de commons es la frontera: validar acá
 * es lo que impide que una fila cruda llegue a la UI, y su error se mapea a la
 * taxonomía de la app en vez de subir un `ZodError` que ninguna pantalla sabe
 * mostrar.
 *
 * EL `context` NO ES COSMÉTICO. `toAppError` cae en `Errors.unknown()`, que sí
 * llega a Sentry (kind `unknown`), pero un `ZodError` desnudo no dice qué fila
 * ni qué campo: el evento dice "algo falló" y no dice dónde. Con los `issues` en
 * el `context` —`path`, `expected`, `received`— el triage puede leer el campo sin
 * reproducir. Es el mismo criterio que `withDiagnostics` en el mapper, que
 * conserva el copy y le re-ataja el crudo del driver.
 */
function valida<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
	const parsed = schema.safeParse(data);
	if (parsed.success) return parsed.data;
	throw new AppError(
		"unknown",
		"La respuesta no coincide con el contrato",
		"ANNOUNCEMENT_INVALID_ROW",
		{
			issues: parsed.error.issues,
			// El `message` del ZodError es el JSON de los issues, que ya va arriba;
			// esto es para cuando el shape de `data` difiere entero y no hay issues.
			rows: Array.isArray(data) ? data.length : null,
		},
	);
}

/**
 * Los avisos que le llegan a esta sesión, YA ORDENADOS por `priority desc,
 * created_at desc`. El nombre dice "pendientes" y el que decide cuáles están
 * pendientes es el dominio, con los dos sets; lo que llega acá es lo que la
 * policy deja pasar, que es exactamente lo mismo que "pendiente para esta
 * audiencia".
 *
 * El orden lo pone ESTA consulta y no el agrupado, así que hay una sola regla de
 * orden en el feature y el `ORDER BY` es el que se puede leer contra el índice
 * parcial `(active, priority desc, created_at desc)`.
 */
export async function fetchPendingAnnouncements(): Promise<Announcement[]> {
	const { data, error } = await supabase
		.from("announcements")
		.select(COLUMNAS)
		.order("priority", { ascending: false })
		.order("created_at", { ascending: false });

	if (error) throw toAppError(error);

	// Una fila que el contrato rechaza es, en la práctica, inalcanzable: los
	// CHECK y los NOT NULL de la tabla garantizan lo que el schema pide. Por eso
	// el fallo es ruidoso —con la lista entera en error, y la app abre igual
	// (D7)— y no una lista a medias que esconda justo el `required` que sí
	// importa.
	return valida(AnnouncementSchema.array(), data);
}

/**
 * Los `required` que esta persona ya registró. Sin filtro por usuario: la
 * policy `Users read their own acknowledgements` es `using (user_id =
 * auth.uid())` y ya saca las filas ajenas.
 */
export async function fetchAcknowledgedIds(): Promise<ReadonlySet<string>> {
	const { data, error } = await supabase
		.from("announcement_acknowledgements")
		.select("announcement_id");

	if (error) throw toAppError(error);

	return new Set(
		valida(acknowledgementRow.array(), data).map((row) => row.announcement_id),
	);
}

/**
 * Registra el `required` como entendido, DIRECTO a Supabase.
 *
 * POR QUÉ NO POR EL API: el invariante "solo acknowledge para vos" lo sostiene
 * la policy `with check (user_id = auth.uid())`, que es una restricción de la
 * base. Por el API lo tendría que sostener el service —que escribe con
 * `BYPASSRLS`— y sería una línea de código, que es justo lo que se-reviewa y se
 * rompe sin que nada avise.
 *
 * `user_id` viaja porque la columna es NOT NULL y no hay trigger que lo selle
 * (al revés de `app_store.reporter_id`): el valor es el de la sesión, nunca uno
 * que venga del llamador.
 */
export async function acknowledgeAnnouncement(id: string): Promise<void> {
	const {
		data: { user },
	} = await supabase.auth.getUser();
	// Sin sesión no hay acknowledgement posible. Un `required` nunca llega a un
	// anónimo —la policy se lo saca— así que esto solo puede pasar si la sesión
	// expiró entre la lectura y el toque; mejor un error que un "Entendido" que
	// no se guardó y vuelve en cada apertura, para siempre.
	if (!user?.id) throw Errors.unauthorized();

	const { error } = await supabase.from("announcement_acknowledgements").upsert(
		{ announcement_id: id, user_id: user.id },
		// `ON CONFLICT DO NOTHING` ES la idempotencia: la PK es
		// `(announcement_id, user_id)` y la tabla no tiene policy de UPDATE ni
		// de DELETE, así que un `insert` reintentado —doble toque, corte de
		// red— moriría con 23505 y el acknowledgement parecería fallado
		// estando escrito. Y no pide permiso de UPDATE, que la tabla no da.
		{ onConflict: "announcement_id,user_id", ignoreDuplicates: true },
	);

	if (error) throw toAppError(error);
}

/**
 * La audiencia del descarte local: el rol que la sesión resolvió, que es la
 * misma fuente que usa `auth_helpers.my_role()` en la policy para decidir entre
 * `consumers` y `businesses`. Sin sesión es `anon`.
 *
 * Se lee del store y no se pasa por parámetro a propósito: el descarte es de una
 * audiencia, y si el llamador pudiera equivocarse de rol la consequence es
 * silenciosa —un aviso de negocios quedaría descartado para un consumidor—. La
 * audiencia se deriva, no se declara.
 */
export function currentAudience(): AnnouncementAudience {
	return announcementAudience(useAuthStore.getState().profile?.role);
}

/** Los ids descartados de ESTA audiencia, o `null` si el valor no es nuestro. */
function parseDismissals(raw: string | null): string[] | null {
	if (raw === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	// No se validan los ids contra `UuidSchema`: los escribió esta misma función a
	// partir de avisos ya validados, y lo único que hace falta distinguir es "un
	// valor nuestro" de "corrupto". Cualquier otra cosa se descarta entera, que es
	// el mismo criterio que usa `pendingDeviceTokenRevocationRepository`.
	const result = z.array(z.string().min(1)).safeParse(parsed);
	return result.success ? result.data : null;
}

/**
 * Los `info` que esta persona ya descartó en ESTE dispositivo, para la audiencia
 * de la sesión.
 *
 * Nunca lanza: un storage caído se lee como "nada descartado". Reaparecer un
 * `info` es una molestia; romper el arranque por un almacenamiento es peor —y
 * esta lectura corre en el camino de apertura de la app (D7)—.
 */
export async function fetchDismissedIdsLocally(): Promise<ReadonlySet<string>> {
	try {
		return new Set(
			parseDismissals(
				await AsyncStorage.getItem(localDismissalKey(currentAudience())),
			) ?? [],
		);
	} catch {
		return new Set();
	}
}

/**
 * Descarta los `info` localmente, POR AUDIENCIA.
 *
 * No hay fila en la base para esto —a diferencia del acknowledgement—: un
 * informativo no necesita dejar rastro, y por eso vive en AsyncStorage y no en
 * `announcement_acknowledgements`.
 *
 * La clave lleva la audiencia porque el descarte es de una audiencia: si la
 * persona cambia de rol en el mismo dispositivo, la clave nueva no lee la vieja
 * y los avisos del otro rol vuelven a estar pendientes.
 *
 * Tampoco lanza. La escritura se hace en paralelo con la actualización de la
 * caché de la sesión —que es la que saca el modal de la pantalla—, así que
 * perder el descarte solo hace que el `info` vuelva a aparecer en la próxima
 * apertura.
 */
export async function dismissAnnouncementsLocally(
	ids: string[],
): Promise<void> {
	if (ids.length === 0) return;
	const key = localDismissalKey(currentAudience());

	let previous: string[] = [];
	try {
		previous = parseDismissals(await AsyncStorage.getItem(key)) ?? [];
	} catch {
		// Storage caído: se escribe igual, partiendo de cero. El aviso se descarta
		// en la caché de todos modos y el próximo descarte agrega sobre lo que hay.
	}

	const merged = [...new Set([...previous, ...ids])].slice(
		-MAX_LOCAL_DISMISSALS,
	);
	try {
		await AsyncStorage.setItem(key, JSON.stringify(merged));
	} catch {
		// Ver la nota del lector: el descarte se pierde, el modal ya salió.
	}
}
