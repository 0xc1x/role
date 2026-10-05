/**
 * Los avisos del operador en el móvil: qué se ve, en qué orden y cuándo se va.
 *
 * Este es el índice del feature y su comentario ES la frontera. Lo que sale de
 * acá es lo que la pantalla necesita para hacer su trabajo y nada que le
 * permita saltarse una regla. La lista es completa —runtime y tipos— y lo que se
 * quitó está en "NO se exporta", con su motivo.
 *
 * EXPORTA:
 *
 *  - `useAnnouncementModals` y el tipo `AnnouncementModal`: es lo que consume
 *    la Task 6. `AnnouncementModal` es el TIPO, no el componente —el componente
 *    que lo renderiza se llama `AnnouncementDialog`—, y con dos símbolos
 *    homónimos en el mismo feature uno de los dos tendría que renombrarse en el
 *    import.
 *  - `AnnouncementDialog`: lo pinta `AnnouncementModals`, y sus dos callbacks
 *    (`onAcknowledge` y `onDismissInfo`) salen del hook con los mismos nombres:
 *    quien lo monta no tiene forma de resolver un `required` por su cuenta.
 *  - `AnnouncementModals`: lo monta el layout raíz, que es el único lugar desde
 *    donde tiene que abrir. Es módulo propio y no JSX en el layout para que sus
 *    decisiones se prueben EJECUTANDO el componente: mounted en el layout raíz,
 *    probarlo significa levantar Expo Router, Sentry y las fuentes.
 *  - `buildModalSequence`: la regla del producto —D9 y D10— que decide qué ve la
 *    persona. Sale porque una regla que solo se puede ejercitar a través de un
 *    hook no se puede revisar de un vistazo, y es pura: recibe la lista y los
 *    dos sets, devuelve la secuencia, no toca red ni disco y no decide a quién
 *    le toca nada.
 *  - `firstPendingModal` y `modalIdentity`: las dos decisiones de LECTURA de la
 *    cola que usa `AnnouncementModals`. La segunda —la `key`— decide si el
 *    estado interno de un modal sobrevive al aviso siguiente, y como la `key`
 *    travela con la identidad, es también lo que hace que un `required` cerrado
 *    con el gesto de atrás vuelva a verse cuando la cabeza de la cola cambia de
 *    identidad, sin esperar al próximo arranque.
 *  - `announcementQueryKey` y el tipo `AnnouncementAudience`: para que quien
 *    monte el modal lea o invalide la misma entrada del caché sin reconstruir la
 *    forma de la clave, que es como dos personas terminan con claves distintas
 *    para lo mismo. El tipo se exporta porque es el parámetro de esa función:
 *    declararlo sin nombrarlo obligaría al llamador a inferirlo, y lo que
 *    queda al alcance de una pantalla es la audiencia que le pasa al hook.
 *  - `announcementModalSequenceOptions` y `fetchAnnouncementModalSequence`: los
 *    dos existen para que D7 sea comprobable sin montar React. `retry: false` y
 *    la ausencia de `throwOnError` son valores dentro de un `useQuery({...})`
 *    que un test no puede leer, y la función que arma la secuencia solo se
 *    ejercita a través del ciclo de vida de la consulta.
 *  - `useAnnouncementList`, `announcementListOptions`,
 *    `fetchAnnouncementList` y `announcementListQueryKey`: lo que la pantalla de
 *    «ver todos» necesita del hook. `announcementListQueryKey` sale por la misma
 *    razón que `announcementQueryKey` —quien monte la lista tiene que poder leer
 *    o invalidar su entrada sin reconstruir la forma de la clave—, y además porque
 *    las dos claves se parecen a propósito y confundirlas escribiría filas donde
 *    hay modales.
 *
 * NO se exporta, y el motivo de cada uno:
 *
 *  - `AnnouncementList`. No por secreto sino por COSTE DE STUBS: el componente se
 *    monta desde la ruta y el import de la ruta lo hace por ruta directa —como
 *    `app/report-problem.tsx` con su sheet—, mientras que el layout, que no es
 *    una ruta, importa `AnnouncementModals` por acá. Reexportarlo obligaría a que
 *    todo `mock.module("@/src/core/ui", …)` parcial que carga este módulo
 *    declarara `EmptyState`, `LoadingView`, `Screen`, `ScreenHeader` y
 *    `StatusBadge` aunque no renderice una fila, y la falla que eso produce
 *    apunta al test y no al export que la causó.
 *  - `acknowledgeAnnouncement` y `dismissAnnouncementsLocally`. Que el
 *    acknowledgement escriba con el `user_id` de la sesión es lo que sostiene el
 *    invariante "solo acknowledge para vos" junto a la policy; si el componente
 *    pudiera pasar un usuario, el invariante pasa a ser una línea de código. El
 *    descarte local, por lo mismo: su clave de audiencia se deriva de la sesión
 *    y no se declara. Por eso la pantalla no los tiene: los usa el hook.
 *  - `dismissRequiredAnnouncementLocally`. Por la misma razón, y con un motivo
 *    más: silenciar un `required` NO escribe la fila de acknowledgement —esa
 *    tabla no tiene policy de UPDATE ni de DELETE—, y que el botón que lo dispara
 *    fuera del módulo obligaría a que alguien entendiera por qué esa fila no
 *    existe. Lo usa el hook de la lista.
 *  - `announcementAudience` y `localDismissalKey`. Son la manera en que el
 *    descarte se ata a una audiencia. Que no salgan de acá es lo que hace cierto
 *    el argumento de "la audiencia se deriva, no se declara" a nivel de módulo, y
 *    no solo dentro del repositorio: no hay forma de que una pantalla o un
 *    componente importen la clave y declaren a quién se le descarta.
 *  - `applyLocalDismissal` y `applyAcknowledgement`. Son la mecánica interna de
 *    la actualización de caché del hook; la pantalla no arma secuencias ni las
 *    edita, las recibe.
 *  - `buildAnnouncementList` y los tipos `AnnouncementListItem` /
 *    `AnnouncementListState`. La lista los recibe ya armados: el componente no
 *    sabe qué es un `severity` ni qué estado corresponde a qué conjunto, y
 *    exportar el agrupado sería darle la regla a la capa que la recibe.
 *  - `MAX_LOCAL_DISMISSALS`. Es un tope de almacenamiento, no un parámetro de
 *    presentación.
 *  - `fetchPendingAnnouncements`, `fetchAcknowledgedIds`,
 *    `fetchDismissedIdsLocally` y `fetchDismissedRequiredIdsLocally`: leer por
 *    fuera de la consulta saltearía el agrupado, que es justamente donde están D9
 *    y D10. Los dos almacenes de descarte local también: juntarlos por comodidad
 *    produciría estados que el dominio no sabe generar.
 */
export {
	buildModalSequence,
	firstPendingModal,
	modalIdentity,
} from "./domain/announcement";
export type {
	AnnouncementAudience,
	AnnouncementModal,
} from "./domain/announcement";
export { AnnouncementDialog } from "./components/AnnouncementDialog";
export { AnnouncementModals } from "./components/AnnouncementModals";
export {
	announcementListOptions,
	announcementListQueryKey,
	announcementModalSequenceOptions,
	announcementQueryKey,
	fetchAnnouncementList,
	fetchAnnouncementModalSequence,
	useAnnouncementList,
	useAnnouncementModals,
} from "./hooks";
