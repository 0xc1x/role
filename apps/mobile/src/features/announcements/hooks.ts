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
	buildModalSequence,
	type AnnouncementAudience,
	type AnnouncementModal,
} from "./domain/announcement";
import {
	acknowledgeAnnouncement,
	dismissAnnouncementsLocally,
	fetchAcknowledgedIds,
	fetchDismissedIdsLocally,
	fetchPendingAnnouncements,
} from "./data/repository";

/**
 * La clave del caché de los avisos, POR AUDIENCIA.
 *
 * Va la audiencia adentro porque la secuencia de una audiencia no es la de
 * otra: el descarte local está guardado por audiencia y el acknowledgement vive
 * en el servidor, de la persona. Cambiar de rol tiene que ser un `queryKey`
 * nuevo, o el modal de un consumidor abriría con la cola que el mismo
 * dispositivo descartó siendo de negocio.
 *
 * Se exporta para que quien monte el modal pueda leer o invalidar la misma
 * entrada: reconstruir la forma de la clave a mano es la forma más común de que
 * dos personas queden con claves distintas para lo mismo.
 */
export function announcementQueryKey(audience: AnnouncementAudience) {
	return ["announcements", "modals", audience] as const;
}

/**
 * Lee los tres insumos y devuelve la secuencia de modales ya agrupada.
 *
 * Se exporta y no queda inline en el `queryFn` para que sea comprobable sin
 * montar React: es la función que decide qué ve la persona, y una prueba que
 * necesita un render para ver su resultado es una prueba que no se va a
 * escribir.
 *
 * Los tres se leen juntos y en paralelo porque son de tres sitios distintos —
 * la base para lo pendiente, el servidor para lo entendido, el dispositivo para
 * lo descartado— y ninguno depende del otro. Los avisos son pocos: el teto son
 * los `limit` del contrato y no llegan ni a una pantalla.
 */
export async function fetchAnnouncementModalSequence(): Promise<
	AnnouncementModal[]
> {
	const [announcements, acknowledgedIds, dismissedIds] = await Promise.all([
		fetchPendingAnnouncements(),
		fetchAcknowledgedIds(),
		fetchDismissedIdsLocally(),
	]);
	return buildModalSequence(announcements, acknowledgedIds, dismissedIds);
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
 * `enabled` entra como parámetro y NO se calcula acá: la audiencia y la sesión
 * las lee el store dentro del hook, y una función pura que las recibe no puede
 * mentir sobre lo que decide.
 */
export function announcementModalSequenceOptions(
	audience: AnnouncementAudience,
	sessionResolved: boolean,
): UseQueryOptions<AnnouncementModal[], Error> {
	return {
		queryKey: announcementQueryKey(audience),
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
	const role = useAuthStore((s) => s.profile?.role);
	const queryClient = useQueryClient();
	const audience = announcementAudience(role);
	const queryKey = announcementQueryKey(audience);

	const query = useQuery(
		announcementModalSequenceOptions(audience, initialized),
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
