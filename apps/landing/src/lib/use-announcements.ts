/**
 * Los avisos del operador, resueltos en el loader SSR y leídos en el cliente.
 *
 * Vive en su propio archivo y no en `use-config.ts` a propósito: ese ya mezcla
 * configuración y métricas, y un tercer dato sin relación con ninguno de los dos
 * lo vuelve un cajón de sastre. El patrón que se sigue —el loader que degrada a
 * `failed` en vez de romper el render, y el hook con tres estados— sí es el de
 * `use-config.ts`, y está copiado de ahí a propósito, para que las dos lecturas
 * se reconozcan.
 *
 * NO se decide acá a quién le toca un aviso, ni si está vigente, ni si es
 * `required`. Eso es la policy de Supabase, entera, y este archivo no puede
 * replicarla: una segunda copia de la regla se desincroniza de la primera sin
 * que nada avise. Lo único que se hace es parsear con el contrato lo que la
 * policy dejó pasar, y degradar cuando ni eso se pudo.
 */

import type { Announcement } from "@0xc1x/role-commons";
import { type QueryClient, useQuery } from "@tanstack/react-query";

import { announcementsQueryOptions } from "./queries";

/**
 * Procedencia de los avisos, en tres estados y no en dos.
 *
 * - `api`: vino una lista real.
 * - `loading`: la petición todavía no resolvió (primer render sin caché, o
 *   navegación del cliente). No hay avisos, pero tampoco hay fallo.
 * - `failed`: la petición —o la validación de lo que volvió— falló.
 *
 * POR QUÉ el tercer estado, y por qué importa acá más que en las stats: sin él,
 * "no hay ningún aviso publicado" y "la API de anuncios está caída" se pintan
 * exactamente igual, que es **no pintar nada**. El servicio de la API lo dice
 * explícitamente —no devuelve `[]` en el fallo *porque el banner del landing se
 * come el incidente*—, así que del lado del cliente el `source` es lo que
 * devuelve esa distinción. Viaja al markup como `data-announcements-source` en
 * el `<main>` de la landing.
 *
 * Los tres NOMBRES son los mismos que usa `PlatformStatsSource`, a propósito:
 * son un vocabulario de la casa y una lectura nueva no debería tener que
 * aprenderlo. Son dos uniones de tres valores, no un tipo compartido: unificar
 * dos lecturas que no se necesitan juntas costaría más de lo que ahorra.
 */
export type AnnouncementsSource = "api" | "loading" | "failed";

export interface AnnouncementsResult {
	/** Los avisos, o `undefined` mientras carga y si la API no respondió. */
	data: readonly Announcement[] | undefined;
	source: AnnouncementsSource;
}

/**
 * Resuelve los avisos en el loader SSR degradando en vez de romper el render.
 *
 * NUNCA lanza, y esa es toda la función: la landing es un sitio de marketing y
 * de SEO, y su trabajo es que alguien pueda suscribirse. Un `required` —o un
 * `info`— que falta no puede ser la razón por la que la página no se pinta; un
 * aviso es información, no una dependencia.
 *
 * Por eso el fallo NO se convierte en `[]`: el que degrade devuelve
 * `data: undefined` y `source: "failed"`, que son afirmaciones distintas de las
 * que haría una lista vacía, y el `<main>` las publica para que el incidente se
 * pueda auditar desde el HTML servido.
 *
 * No distingue `loading` porque para un loader ese estado no existe: `await`
 * resuelve o lanza, nunca "todavía no". Esa es también la garantía de que el
 * HTML servido nunca lleva `loading`.
 */
export async function ensureAnnouncements(
	queryClient: QueryClient,
): Promise<AnnouncementsResult> {
	try {
		const data = await queryClient.ensureQueryData(announcementsQueryOptions);
		return { data, source: "api" };
	} catch {
		// MUTACION: degradar a lista vacia en vez de declarar el fallo.
		return { data: undefined, source: "failed" };
	}
}

/**
 * Los mismos avisos y el mismo discriminador, del lado del cliente.
 *
 * El valor sale de la caché que el loader primedó, así que el atributo coincide
 * con el del HTML servido y se corrige solo cuando una reconsulta posterior sí
 * trae avisos.
 */
export function useAnnouncements(): AnnouncementsResult {
	const { data, status } = useQuery(announcementsQueryOptions);
	// `data` primero: una query que ya trae avisos y está revalidando sigue siendo
	// `api`. Sin datos, el estado de la query es lo que separa "todavía no" de "no
	// va a venir".
	const source: AnnouncementsSource =
		data !== undefined ? "api" : status === "pending" ? "loading" : "failed";
	return { data, source };
}
