import { AnnouncementDialog } from "./AnnouncementDialog";
import {
	firstPendingModal,
	modalIdentity,
	useAnnouncementModals,
} from "../index";

/**
 * El montaje de los avisos: el queue y el `Modal` del layout.
 *
 * Existe como módulo propio y no inline en `app/_layout.tsx` por una razón
 * comprobable. Todo lo que decide —qué modal se abre, con qué identidad se
 * monta, y a qué callback va cada gesto— estaba dentro del layout raíz, y
 * levantar ese layout en `bun test` significa levantar Expo Router, Sentry,
 * `expo-font` y el `ThemeProvider`. Con la lógica acá, sus únicas dependencias
 * son el hook, dos funciones puras del dominio y el dialog, y los casos se
 * LEEN: se monta, se toca el botón y se mira a quién le llegó.
 *
 * El detalle de la estructura —que el JSX esté fuera del `<Stack>`— NO se
 * verifica desde acá, porque este componente no sabe dónde lo montan. Ese
 * invariant vive en `layout.mount.test.ts`, que sí lee el archivo del layout.
 *
 * SIN ÍNDICE QUE SE AVANCE: se pinta el primero de la cola y nada más. El
 * acknowledgement saca su modal, así que el siguiente aparece solo. Un puntero
 * que este componente advanced por su cuenta es una clase entera de fallas que
 * no se ven en la app —se saltea un `required`, o se queda mostrando uno ya
 * entendido— y ninguna se comprueba hasta que alguien la ve.
 */
export function AnnouncementModals() {
	const { modals, acknowledge, dismissInfo } = useAnnouncementModals();
	const modal = firstPendingModal(modals);
	// Sin cola no hay nada que abrir. El hook devuelve `[]` antes de que la
	// consulta haya resuelto y cuando falla (D7), así que este es también el
	// camino del arranque sin red: el modal no bloquea la apertura.
	if (!modal) return null;
	return (
		<AnnouncementDialog
			// La `key` es la identidad del modal, no su posición. El dialog tiene
			// estado interno —la página del lote de `info` y el "escondido sin
			// resolver" del `required`—, así que con la key por índice sacar el
			// primer aviso de la cola reutilizaría el nodo del anterior con el
			// estado del anterior: un `required` que la persona cerró con el gesto
			// de atrás dejaría escondido al siguiente.
			key={modalIdentity(modal)}
			modal={modal}
			// Dos gestos, dos callbacks y ninguna forma de cruzarlos: los
			// parámetros son distintos (`id` contra `ids`), y eso lo hace el
			// compilador, no la costumbre.
			onAcknowledge={acknowledge}
			onDismissInfo={dismissInfo}
		/>
	);
}
