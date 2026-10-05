import {
	useQuery,
	useQueryClient,
	type UseQueryOptions,
} from "@tanstack/react-query";

import { useAuthStore } from "@/src/features/auth/store";

import {
	announcementAudience,
	applyAcknowledgement,
	applyLocalDismissal,
	buildAnnouncementList,
	buildModalSequence,
	type AnnouncementAudience,
	type AnnouncementListItem,
	type AnnouncementListState,
	type AnnouncementModal,
} from "./domain/announcement";
import {
	acknowledgeAnnouncement,
	dismissAnnouncementsLocally,
	dismissRequiredAnnouncementLocally,
	fetchAcknowledgedIds,
	fetchDismissedIdsLocally,
	fetchDismissedRequiredIdsLocally,
	fetchPendingAnnouncements,
} from "./data/repository";

/**
 * La clave del caché de los avisos: POR AUDIENCIA y POR PERSONA.
 *
 * Son dos dimensiones distintas y hacen falta las dos.
 *
 * LA AUDIENCIA porque la secuencia de una audiencia no es la de otra: el
 * descarte local está guardado por audiencia —`role.announcements.dismissed.v1`
 * lleva el rol—, así que cambiar de rol tiene que ser un `queryKey` nuevo o el
 * modal de un consumidor abriría con la cola que el mismo dispositivo descartó
 * siendo de negocio.
 *
 * LA PERSONA porque `announcement_acknowledgements` es por `(announcement_id,
 * user_id)` y el estado que resuelve los `required` vive ahí, no en el
 * dispositivo. Sin el `userId` en la clave, un cierre de sesión INVOLUNTARIO —
 * una sesión revocada desde otro lado, un refresh token invalidado— deja la
 * entrada viva durante los `gcTime` (30 min) y la próxima persona que use ese
 * dispositivo la hereda: un `required` que ella nunca registró le queda
 * invisible. Es la falla inversa a la que la migración prohíbe explícitamente:
 * "un `required` tiene que volver en cada apertura hasta que la persona lo
 * entienda".
 *
 * El logout VOLUNTARIO ya limpia el caché (`sign-out.ts` → `queryClient.clear()`),
 * pero la store también se limpia sola cuando la sesión expira (`store.ts`,
 * `clear()` desde `onAuthStateChange`) y ahí no pasa por ese `clear()`. La
 * convención del repo es que toda consulta con estado de usuario lleve el
 * `profileId` —`["favorites","list",profileId]`, `["orders",profileId,…]`— y esto
 * no es la excepción: es la misma regla.
 *
 * `null` se ancla a `"anon"` para que la clave sea siempre un arreglo de
 * strings y no haya dos formas de la misma clave según si hay sesión.
 */
export function announcementQueryKey(
	audience: AnnouncementAudience,
	userId: string | null,
) {
	return ["announcements", "modals", audience, userId ?? "anon"] as const;
}

/**
 * Lee los tres insumos y devuelve la secuencia de modales ya agrupada.
 *
 * Se exporta y no queda inline en el `queryFn` para que sea comprobable sin
 * montar React: es la función que decide qué ve la persona, y una prueba que
 * necesita un render para ver su resultado es una prueba que no se va a
 * escribir.
 *
 * Los CUATRO se leen juntos y en paralelo porque son de sitios distintos —la
 * base para lo pendiente, el servidor para lo entendido, el dispositivo para lo
 * descartado y el dispositivo otra vez para lo silenciado— y ninguno depende del
 * otro.
 *
 * Y EL CUARTO NO ES OPCIONAL: sin él, un `required` que la persona silenció
 * vuelve a salir como modal en cada apertura y la función que silencia no
 * silencia nada. Es la razón por la que hay dos almacenes de descarte local, y
 * esta consulta tiene que leer los dos: cada set se pasa a `buildModalSequence`
 * para su severidad, sin mezclarlos.
 *
 * El agrupado es en memoria y a propósito: el tope de esta lectura no es un
 * `limit` del contrato sino cuántos avisos `active` tiene publicados el
 * operador, que es un HECHO DE OPERACIÓN —cuántas cosas escribe una persona— y
 * no un invariante técnico. Por eso `listForAudience` devuelve la lista entera
 * y acá no hay `.limit()` en el read path; el `limit` que sí existe en el
 * contrato es el del listado del panel, que no pasa por esta lectura. Agregar
 * uno no sería corregirla sino cambiar la decisión, y quien lo agregue tiene que
 * decidir qué se descarta de una lista que RLS ya declaró elegible.
 */
export async function fetchAnnouncementModalSequence(): Promise<
	AnnouncementModal[]
> {
	const [announcements, acknowledgedIds, dismissedIds, dismissedRequiredIds] =
		await Promise.all([
			fetchPendingAnnouncements(),
			fetchAcknowledgedIds(),
			fetchDismissedIdsLocally(),
			fetchDismissedRequiredIdsLocally(),
		]);
	return buildModalSequence(
		announcements,
		acknowledgedIds,
		dismissedIds,
		dismissedRequiredIds,
	);
}

/**
 * Las opciones de la consulta de avisos, en una función y no inline en el hook.
 *
 * La razón es comprobable: `retry: false` y la ausencia de `throwOnError` son
 * D7 —"la apertura de la app no depende de esta consulta"— y son dos valores
 * que dentro de un `useQuery({...})` no se pueden leer desde un test sin montar
 * React. Como exportados, un test los mira, y el día que alguien los saque de acá
 * para confiar en el default global se pone rojo.
 *
 * `enabled` y las dos dimensiones de la clave entran como parámetro y NO se
 * calculan acá: la audiencia, la persona y el estado de la sesión los lee el
 * store dentro del hook, y una función pura que los recibe no puede mentir
 * sobre lo que decide.
 */
export function announcementModalSequenceOptions(
	audience: AnnouncementAudience,
	userId: string | null,
	sessionResolved: boolean,
): UseQueryOptions<AnnouncementModal[], Error> {
	return {
		queryKey: announcementQueryKey(audience, userId),
		queryFn: fetchAnnouncementModalSequence,
		// Sin sesión resuelta no hay audiencia que valga: leer con el anon key y
		// repetir en cuanto llegue la sesión es leer dos veces para no saber nada
		// la primera. Además, la policy de select exige `now() >= start_at`, así que
		// una lectura hecha antes de resolver la sesión puede traer una ventana que
		// después se cierra, y el `info` se mostraría fuera de su rango.
		enabled: sessionResolved,
		//
		// NO hay `throwOnError`, y es a propósito: con él, un fallo sube por el
		// árbol y la pantalla que monta este hook se cae con él. Un `required` es
		// obligatorio —no se puede pasar por alto mientras se lee—, pero no puede
		// ser la razón por la que la app no abre.
		//
		// El aviso se consulta una vez por arranque, no en cada cambio de pantalla:
		// el layout lo monta una vez y no se desmonta al navegar.
		staleTime: 5 * 60_000,
		gcTime: 30 * 60_000,
		// El default global reintenta una vez. Acá no: un reintento diferido es un
		// modal que aparece más tarde sin que nadie lo haya pedido, y si lo que
		// reaparece es un `required` es un aviso obligatorio repetido sin que la
		// persona haya vuelto a hacer nada. Un intento y sigue.
		retry: false,
	};
}

/**
 * El hook que la Task 6 monta en el layout: qué avisos ve la persona, en qué
 * orden y cuántos modales tiene que atravesar.
 *
 * D7, en una línea: un fallo deja `modals` en `[]` y la app abre igual.
 */
export function useAnnouncementModals() {
	const initialized = useAuthStore((s) => s.initialized);
	const profile = useAuthStore((s) => s.profile);
	const queryClient = useQueryClient();
	const audience = announcementAudience(profile?.role);
	const queryKey = announcementQueryKey(audience, profile?.id ?? null);

	const query = useQuery(
		announcementModalSequenceOptions(
			audience,
			profile?.id ?? null,
			initialized,
		),
	);

	/**
	 * Registra el `required` como entendido y lo saca de la cola.
	 *
	 * La actualización de la caché va DESPUÉS del `await`, no antes: si la
	 * escritura falla, el obligatorio tiene que seguir en la cola. Sacarlo de
	 * forma optimista lo cerraría como entendido sin estarlo, y como el
	 * acknowledgement no se puede deshacer —la tabla no tiene policy de UPDATE ni
	 * de DELETE—, la persona no volvería a verlo nunca y el aviso se pierde.
	 */
	const acknowledge = async (id: string): Promise<void> => {
		await acknowledgeAnnouncement(id);
		queryClient.setQueryData<AnnouncementModal[]>(queryKey, (modales) =>
			modales ? applyAcknowledgement(modales, id) : modales,
		);
	};

	/**
	 * Descarta el lote de `info` en el dispositivo.
	 *
	 * Sale de la pantalla sin esperar a la red porque no hay red que esperar: un
	 * `info` no tiene fila en la base, es un id en AsyncStorage, y hacer esperar
	 * a la persona por un gesto que ya no necesita red sería una demora sin
	 * causa. La escritura a disco va detrás y sin bloquear; si falla, el aviso
	 * reaparece en la próxima apertura, que es el precio de no romper el
	 * arranque.
	 *
	 * El `required` no sale por acá: ese acknowledgement lo escribe el servidor, o
	 * no sale nunca.
	 */
	const dismissInfo = (ids: string[]): void => {
		queryClient.setQueryData<AnnouncementModal[]>(queryKey, (modales) =>
			modales ? applyLocalDismissal(modales, new Set(ids)) : modales,
		);
		void dismissAnnouncementsLocally(ids);
	};

	return {
		modals: query.data ?? [],
		acknowledge,
		dismissInfo,
	};
}

/**
 * La clave del caché de la LISTA, y por qué no es la clave de los modales.
 *
 * Las dos dimensiones son las mismas —la audiencia porque el descarte local se
 * keyea por ella, la persona porque el acknowledgement es por `(announcement_id,
 * user_id)`— y por eso se derivan igual. Lo que cambia es la ENTRADA: lo que se
 * guarda acá es un `AnnouncementListItem[]` y lo de allá un
 * `AnnouncementModal[]`, y dos formas distintas no pueden compartir una clave.
 *
 * Compartirla no sería "usar el mismo caché": sería que el `setQueryData` de una
 * pantalla escribiera su lista de filas donde la otra espera una secuencia de
 * modales, y la siguiente lectura de cualquiera de las dos encontraría datos que
 * no son suyos. Dos entradas, tres expectativas.
 */
export function announcementListQueryKey(
	audience: AnnouncementAudience,
	userId: string | null,
) {
	return ["announcements", "list", audience, userId ?? "anon"] as const;
}

/**
 * Los TRES insumos de la lista, y por qué los tres.
 *
 * El modal lee los TRES, cada set para su severidad: el acknowledgement y el
 * silencio local son del `required`, el descarte local es del `info`. Esta
 * pantalla muestra los dos estados de `required` y el descarte de los `info`, así
 * que lee los tres. Con dos de ellos, un `required` silenciado en el teléfono sale
 * `pending` — que es exactamente el motivo por el que existe el estado
 * `dismissed` — y el gesto de silenciarlo parece no haber hecho nada.
 *
 * Se exporta y no queda inline en el `queryFn` por la misma razón que
 * `fetchAnnouncementModalSequence`: es la función que decide qué ve la persona
 * en esta pantalla, y una decisión que solo se puede leer a través del ciclo de
 * vida de una consulta es una decisión que no se llega a probar.
 *
 * Los tres van en paralelo porque son de tres sitios distintos —la base para lo
 * elegible, el servidor para lo entendido, el dispositivo para lo silenciado— y
 * ninguno depende del otro.
 */
export async function fetchAnnouncementList(): Promise<AnnouncementListItem[]> {
	const [announcements, acknowledgedIds, dismissedRequiredIds] =
		await Promise.all([
			fetchPendingAnnouncements(),
			fetchAcknowledgedIds(),
			fetchDismissedRequiredIdsLocally(),
		]);
	return buildAnnouncementList(
		announcements,
		acknowledgedIds,
		dismissedRequiredIds,
	);
}

/**
 * Las opciones de la consulta de la lista, en una función y no inline en el
 * hook, por el mismo motivo que las del modal: `retry` y la ausencia de
 * `throwOnError` son dos valores que, adentro de un `useQuery({...})`, no se
 * pueden leer sin montar React. Afuera sí, y un test los mira.
 *
 * `staleTime` y `gcTime` son los mismos que los de la cola, y no por simetría:
 * las dos entradas leen las MISMAS tres fuentes, así que ventanas distintas las
 * dejarían mostrando generaciones distintas de la misma lista —el modal con el
 * `required` que la pantalla ya no tiene—.
 */
export function announcementListOptions(
	audience: AnnouncementAudience,
	userId: string | null,
	sessionResolved: boolean,
): UseQueryOptions<AnnouncementListItem[], Error> {
	return {
		queryKey: announcementListQueryKey(audience, userId),
		queryFn: fetchAnnouncementList,
		enabled: sessionResolved,
		staleTime: 5 * 60_000,
		gcTime: 30 * 60_000,
		// Sin `throwOnError`: la pantalla dibuja su propio estado de error con un
		// botón de reintentar, y con él el fallo se llevaría la ruta entera en vez
		// de dejar un motivo y una acción.
		//
		// Y sin reintento automático, como el modal. La diferencia con un modal que
		// aparece solo es que acá hay un «Reintentar» a la vista: un reintento
		// diferido cambiaría el mensaje de una pantalla que la persona ya está
		// leyendo, sin que nadie lo haya pedido.
		retry: false,
	};
}

/**
 * Pasa UNA fila al estado que la escritura recién confirmó y le apaga las dos
 * acciones, porque un aviso resuelto no tiene a qué aplicárselas.
 *
 * ES LA CACHÉ Y NO EL DOMINIO, y esa es toda su autoridad: `buildAnnouncementList`
 * sigue siendo la que decide el estado de cada fila leyendo los tres insumos, y
 * esto solo evita el viaje que volvería a pintar lo mismo un instante después.
 *
 * Por eso se niega a tocar lo que no corresponde. Una fila que no sea la del id
 * no se inventa —un id que no está en la lista no agrega nada—, y una fila que
 * no sea `required` no se toca: el silencio vive en el almacén de los `required`
 * y el acknowledgement en una tabla que solo ellos llenan, así que aplicarlos a
 * un `info` dejaría el caché diciendo «entendido» de algo que el dominio nunca
 * va a confirmar en la próxima lectura.
 */
function conEstadoResuelto(
	items: AnnouncementListItem[],
	id: string,
	estado: Exclude<AnnouncementListState, "pending">,
): AnnouncementListItem[] {
	return items.map((item) =>
		item.announcement.id === id && item.announcement.severity === "required"
			? { ...item, state: estado, canAcknowledge: false, canDismiss: false }
			: item,
	);
}

/**
 * La pantalla de «ver todos»: qué avisos le llegan a esta persona, en el orden en
 * que llegaron, y en qué estado está cada uno para ella.
 *
 * Es el segundo consumidor de los mismos tres insumos que la cola de modales, y
 * por eso comparte con ella la FORMA de la clave sin compartir la entrada.
 *
 * `acknowledge` y `silence` escriben y solo ENTONCES actualizan el caché, por el
 * motivo que está escrito en `useAnnouncementModals`: si la escritura falla, el
 * `required` tiene que seguir en la cola y verse pendiente. Un descarte
 * optimista lo cerraría como entendido sin estarlo, y como la fila de
 * acknowledgement no se puede corregir, no volvería nunca.
 *
 * `silence` es la excepción y por diseño: `dismissRequiredAnnouncementLocally` no
 * pega contra la red —es un id en AsyncStorage— y nunca lanza. No hay a qué
 * volver atrás y la caché se actualiza antes que el disco, porque la fila tiene
 * que cambiar en el acto o el gesto se lee como que no pasó nada.
 */
export function useAnnouncementList() {
	const initialized = useAuthStore((s) => s.initialized);
	const profile = useAuthStore((s) => s.profile);
	const queryClient = useQueryClient();
	const audience = announcementAudience(profile?.role);
	const userId = profile?.id ?? null;
	const listKey = announcementListQueryKey(audience, userId);
	// La cola del layout sigue montada mientras esta pantalla está abierta: si
	// entender un aviso acá no la actualizara, el modal lo volvería a abrir al
	// instante, con el mismo aviso que la persona acaba de registrar.
	const modalKey = announcementQueryKey(audience, userId);

	const query = useQuery(
		announcementListOptions(audience, userId, initialized),
	);

	/**
	 * Registra el `required` como entendido y lo marca entendido en las dos
	 * entradas.
	 *
	 * Las dos, y no solo la de la lista, porque la fila que se acaba de escribir
	 * existe en el servidor para todas las lecturas: la cola del layout tiene el
	 * mismo aviso guardado y, sin tocarla, entenderlo desde acá lo sacaría de esta
	 * pantalla y lo dejaría apareciendo como modal detrás.
	 */
	const acknowledge = async (id: string): Promise<void> => {
		await acknowledgeAnnouncement(id);
		queryClient.setQueryData<AnnouncementListItem[]>(listKey, (items) =>
			items ? conEstadoResuelto(items, id, "acknowledged") : items,
		);
		queryClient.setQueryData<AnnouncementModal[]>(modalKey, (modales) =>
			modales ? applyAcknowledgement(modales, id) : modales,
		);
	};

	/**
	 * Silencia el `required` en el dispositivo y lo marca silenciado.
	 *
	 * NO es un descarte optimista con vuelta atrás: no hay red contra la que
	 * fallar y el repositorio no lanza, así que lo único que puede perderse es el
	 * silencio, que vuelve a la próxima apertura — y eso es preferible a esperar a
	 * la persona por un gesto que ya no necesita red.
	 *
	 * La cola de modales NO se toca acá, y no por descuido: la entrada del layout
	 * se armó con `dismissedRequiredIds` leídos del disco, así que el aviso ya
	 * debería haber salido de esa cola —si no salió, la cola es de una generación
	 * anterior a este gesto y se resuelve sola en la próxima lectura—. Invalidarla
	 * además sería peor: haría volver a leer por un gesto que ya está en el disco,
	 * y eso convierte un gesto local sin red en un viaje.
	 */
	const silence = (id: string): void => {
		queryClient.setQueryData<AnnouncementListItem[]>(listKey, (items) =>
			items ? conEstadoResuelto(items, id, "dismissed") : items,
		);
		void dismissRequiredAnnouncementLocally(id);
	};

	return {
		items: query.data ?? [],
		acknowledge,
		silence,
		isLoading: query.isLoading,
		isError: query.isError,
		refetch: query.refetch,
	};
}
