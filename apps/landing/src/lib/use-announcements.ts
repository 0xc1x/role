/**
 * Los avisos del operador, resueltos en el loader SSR y leídos en el cliente.
 *
 * Vive en su propio archivo y no en `use-config.ts` a propósito: ese ya mezcla
 * configuración y métricas, y un tercer dato sin relación con ninguno de los dos
 * lo vuelve un cajón de sastre. La FORMA se sigue de ahí —el loader que degrada
 * a `failed` en vez de romper el render, y el mismo vocabulario de `source`—
 * porque dos lecturas que se parecen se mantienen solas. Lo que NO se copia es
 * el sitio donde se lee el valor: `usePlatformStats` recalcula su `source` en
 * un observer y por eso el HTML servido de la landing nunca puede llevar
 * `failed`; acá el del loader viaja hasta el markup. Ver `useAnnouncements`.
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
 * come el incidente*—, así que el `source` es lo que devuelve esa distinción.
 * Viaja al markup como `data-announcements-source` en el `<main>` de la landing,
 * y sale de los dos lados: del loader en el render del servidor, del observer en
 * el del cliente.
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
 * Lo que este valor NO puede es omitirse: `loading` no existe acá, porque
 * `await` resuelve o lanza, nunca "todavía no". Y esa mitad —"el loader nunca
 * dice `loading`"— es lo único que este archivo sabe del estado servido. Ver
 * `useAnnouncements` para por qué el hook no alcanza y por qué se le pasa este
 * resultado.
 */
export async function ensureAnnouncements(
	queryClient: QueryClient,
): Promise<AnnouncementsResult> {
	try {
		const data = await queryClient.ensureQueryData(announcementsQueryOptions);
		return { data, source: "api" };
	} catch {
		return { data: undefined, source: "failed" };
	}
}

/**
 * Los avisos y su procedencia, para el render.
 *
 * `delServidor` es el resultado de `ensureAnnouncements` en el loader de la
 * ruta, y es OBLIGATORIO. No por firma: porque el hook solo, con un
 * `useQuery(announcementsQueryOptions)`, **no puede** decir `"failed"` en el
 * render del server, y esa es la mitad del atributo que se publica.
 *
 * ─── POR QUÉ EL OBSERVER NO ALCANZA EN SSR, MEDIDO ─────────────────────────────
 *
 * Medido contra el servidor real, con `/announcements` en 503 y una sonda
 * temporal en el markup:
 *
 *     [PROBE] source=loading  data=undefined
 *     caché: { status: "error", fetchStatus: "idle", errorUpdateCount: 1 }
 *
 * La caché dice `error` y el hook dice `loading`. No es un artefacto de `retry`
 * (con `retry: false` da idéntico) ni del `staleTime`. La causa está en
 * `@tanstack/query-core`, `QueryObserver#createResult`: cuando las opciones
 * llevan `_optimisticResults`, que es lo que `useBaseQuery` arma al montar un
 * observer, la rama optimista corre
 *
 *     newState = { ...newState, ...fetchState(state.data, query.options) }
 *
 * si `shouldFetchOnMount` dice que hay que traer datos — y dice que sí siempre
 * que `data === undefined`, incluso con la query en error. `fetchState` pone
 * `status: "pending"` y `fetchStatus: "fetching"`. En SSR los effects no corren,
 * así que ese resultado optimista es el único que sale, y con `data` en
 * `undefined` la regla de tres estados no tiene de dónde sacar otra cosa.
 *
 * ─── QUÉ HACE ESTE HOOK CON ESA MITAD ─────────────────────────────────────────
 *
 * "El loader dice una cosa y el observer la recalcula" es exactamente el
 * patrón que `use-config.ts` tiene y que quedó pendiente de arreglar para las
 * stats (`data-stats-source`); acá se hace bien y no se copia el defecto.
 *
 * La regla es una sola: mientras el observer no tenga respuesta, contesta el
 * loader; en cuanto la tenga, contesta el observer. Los cuatro casos, medidos
 * contra el mismo servidor:
 *
 *   | server        | observer      | publicado |
 *   |---------------|---------------|-----------|
 *   | `api`         | `api`         | `api`     |
 *   | `failed`      | `loading`     | `failed`  | ← el que se estaba perdiendo
 *   | `api`, cliente reintenta y falla | `failed` | `failed`  |
 *   | `api`, cliente reintenta y funciona | `api` | `api`  |
 *
 * El tercero importa: si el fallo del cliente se tapara con el valor del loader,
 * un incidente de red posterior al render nunca se publicaría.
 *
 * Y el caso sano no parpadea: en el cliente la caché arranca VACÍA —el SSR no
 * se deshidrata en el payload, `fixtures.ts` lo verificó—, así que el primer
 * render del navegador también está en `loading` y devuelve el `data` del
 * loader. El aviso que estaba en el HTML servido sigue en pantalla hasta que la
 * consulta del propio cliente responde, en vez de desaparecer un frame.
 */
export function useAnnouncements(
	delServidor: AnnouncementsResult,
): AnnouncementsResult {
	const { data, status } = useQuery(announcementsQueryOptions);
	// `data` primero: una query que ya trae avisos y está revalidando sigue siendo
	// `api`. Sin datos, el estado de la query es lo que separa "todavía no" de "no
	// va a venir".
	const delCliente: AnnouncementsResult = {
		data,
		source:
			data !== undefined ? "api" : status === "pending" ? "loading" : "failed",
	};
	return delCliente.source === "loading" ? delServidor : delCliente;
}
