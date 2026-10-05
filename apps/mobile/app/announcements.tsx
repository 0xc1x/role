import { useEffect } from "react";
import { router, type Href } from "expo-router";

import { AnnouncementList } from "@/src/features/announcements/components/announcement-list";
import { useAuthStore } from "@/src/features/auth/store";

/**
 * La pantalla de «ver todos» los avisos del operador, alcanzable desde las dos
 * audiencias.
 *
 * POR QUÉ ES DE RAÍZ Y NO DE `(consumer)` NI DE `(business)`: los dos roles
 * reciben avisos y los dos tienen que poder verlos. `(consumer)/profile/` y
 * `(business)/management/` son entradas de audiencias distintas y cada grupo
 * tiene su `_layout` con un guard de rol, así que una pantalla a la que las dos
 * tienen que llegar no puede quedar adentro de una de ellas —el guard de la
 * expulsaría a la otra sin explicación—. La alternativa que se evita es
 * duplicarla en los dos grupos: dos copias de la misma lista que divergen en el
 * primer cambio de copy, y de las dos la que nadie mira es la que se rompe.
 * Precedente: `app/report-problem.tsx`, el otro buzón de las dos audiencias.
 *
 * Y POR QUÉ NO LA MONTA EL LAYOUT, como sí hace el modal de los avisos: el
 * layout monta `AnnouncementModals` porque un modal tiene que SOBREVIVIR a la
 * navegación —dentro del `<Stack>` el router lo desmonta al cambiar de pantalla y
 * un `required` reaparece a mitad de un checkout—. Esta pantalla es lo
 * contrario: es una hoja del stack, con su título, su salida y su gesto de
 * atrás, y montada en el layout quedaría viva debajo de todas las demás sin
 * ninguna razón. El invariante del montaje vive en `layout.mount.test.ts`.
 *
 * LA RUTA ES UN SHELL, y lo que decide son las dos cosas que dependen de la
 * sesión: si hay que expulsar a un invitado y a dónde vuelve el «atrás» según el
 * rol. El título no viaja por prop porque no depende de nada acá: es el mismo
 * `strings.announcements.listTitle` que usa la fila del menú, y mantenerlo en un
 * solo lugar es lo que evita que uno de los dos quede viejo.
 */
export default function AnnouncementsScreen() {
	const { status, initialized } = useAuthStore();
	const role = useAuthStore((s) => s.profile?.role);

	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	// El `fallback` por defecto de `ScreenHeader` es la home del consumidor, y
	// mandaría al dueño de un negocio a una pantalla que no es suya.
	const fallback: Href =
		role === "business" || role === "admin"
			? "/(business)/management"
			: "/(consumer)/profile";

	if (!initialized || status === "guest") return null;

	return <AnnouncementList fallback={fallback} />;
}
