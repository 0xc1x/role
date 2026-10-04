/**
 * Los avisos del operador en el móvil: qué se ve, en qué orden y cuándo se va.
 *
 * Este es el índice del feature y su comentario ES la frontera. Lo que se
 * exporta es lo que la pantalla necesita para hacer su trabajo y nada que le
 * permita saltarse una regla:
 *
 *  - `useAnnouncementModals` y el tipo `AnnouncementModal`: es lo único que la
 *    Task 6 consume. `AnnouncementModal` es el TIPO, no el componente —el
 *    componente que lo renderiza se llama `AnnouncementDialog`—, y con dos
 *    símbolos homónimos en el mismo feature uno de los dos tendría que
 *    renombrarse en el import.
 *  - `buildModalSequence` sale porque es la regla del producto —D9 y D10— y
 *    una regla que solo se puede ejercitar a través de un hook no se puede
 *    revisar de un vistazo. Es pura: recibe la lista y los dos sets, devuelve la
 *    secuencia, y no toca red ni disco.
 *  - `announcementQueryKey` y `announcementModalSequenceOptions` salen para que
 *    quien monte el modal lea o invalide la misma entrada del caché sin
 *    reconstruir la forma de la clave —que es como dos personas terminan con
 *    claves distintas para lo mismo— y para que `retry: false` siga siendo
 *    comprobable sin montar React.
 *
 * NO se exporta:
 *
 *  - `acknowledgeAnnouncement` y `dismissAnnouncementsLocally`. Que el
 *    acknowledgement escriba con el `user_id` de la sesión es lo que sostiene el
 *    invariante "solo acknowledge para vos" junto a la policy; si el componente
 *    pudiera pasar un usuario, el invariante pasa a ser una línea de código. El
 *    descarte local, por lo mismo: su clave de audiencia se deriva de la sesión
 *    y no se declara.
 *  - `localDismissalKey` y `announcementAudience`. Son la manera en que el
 *    descarte se ata a una audiencia, y una pantalla no tiene por qué elegir
 *    una.
 *  - `fetchPendingAnnouncements`, `fetchAcknowledgedIds` y
 *    `fetchDismissedIdsLocally`: leer por fuera de la consulta saltearía el
 *    agrupado, que es justamente donde están D9 y D10.
 */
export {
	announcementAudience,
	applyAcknowledgement,
	applyLocalDismissal,
	buildModalSequence,
	localDismissalKey,
	MAX_LOCAL_DISMISSALS,
} from "./domain/announcement";
export type {
	AnnouncementAudience,
	AnnouncementModal,
} from "./domain/announcement";
export {
	announcementModalSequenceOptions,
	announcementQueryKey,
	fetchAnnouncementModalSequence,
	useAnnouncementModals,
} from "./hooks";
