import type { Announcement, AppRole } from "@0xc1x/role-commons";

/**
 * El agrupado de los avisos del operador. Es la función que decide qué ve la
 * persona, en qué orden y cuántos modales tiene que atravesar: si esto agrupa
 * mal, el producto entero se comporta mal aunque la policy, la API y el panel
 * estén impecables.
 *
 * LO QUE ESTA FUNCIÓN NO HACE, y es la regla más importante del archivo:
 *
 *  - NO filtra por audiencia. La policy `Anyone reads the announcements they
 *    are eligible for` ya decidió a quién le toca cada fila; volver a decidirlo
 *    acá sería una segunda copia de la misma regla, y de las dos copias solo se
 *    corrige la que nadie mira.
 *  - NO filtra `active` ni la ventana temporal. Misma razón: los cinco términos
 *    del `USING` son de la base, y un `now()` del cliente además puede
 *    discrepar del reloj del servidor.
 *  - NO reordena. El `ORDER BY priority DESC, created_at DESC` es de la
 *    consulta, y hay un test que lo fija alimentando la lista al revés.
 *
 * Lo único que hace es sacar lo ya resuelto —los `required` que la persona ya
 * registró y los `info` que ya descartó en el dispositivo— y agrupar lo que
 * queda según D9 y D10.
 */

/**
 * Un modal abierto. `kind` es lo que decide la presentación y lo que decide si
 * el aviso es "una página dentro del lote" o "un modal propio": un `required`
 * nunca comparte modal con nada, y por eso lleva el aviso suelto en vez de una
 * lista de un elemento.
 *
 * LO QUE ESTO YA ACUENTA: el tipo dice MODALES, no avisos. Un lote de cinco
 * `info` es un modal y tres `required` pendientes son tres, así que la
 * invariante se sostiene por construcción y no por una regla de presentación:
 * `buildModalSequence` mete un modal por `required` y UNO solo para todo el lote
 * de `info`, y el layout pinta únicamente el primero de la cola.
 */
export type AnnouncementModal =
	| { kind: "required"; announcement: Announcement }
	| { kind: "info"; announcements: Announcement[] };

/**
 * A qué audiencia pertenece el descarte local de los `info`.
 *
 * Es el rol de la sesión, y no el `audience_kind` de cada aviso: `consumers` y
 * `businesses` se resuelven enteros con el rol (por eso la policy usa
 * `auth_helpers.my_role()`), así que el rol ES la audiencia para todo lo que la
 * policy puede decidir sin mirar `user_ids`.
 *
 * `anon` es una audiencia propia y no "rol=user" porque el anónimo no es un
 * usuario: no puede ver ningún `required` —la policy se lo saca— y no puede
 * acknowledge, así que mezclar sus descartes con los de un `user` de verdad
 * dejaría avisos informed hidden para alguien que sí tiene que verlos.
 *
 * Y NO va el uid: el descarte es "ya lo vi en esta audiencia", no "soy esta
 * persona". El estado que sí es por persona —el acknowledgement de los
 * `required`— vive en el servidor, y es el único que no se puede perder.
 */
export type AnnouncementAudience = AppRole | "anon";

/** Sin sesión no hay rol, y la audiencia de un anónimo es `anon`. */
export function announcementAudience(
	role: AppRole | null | undefined,
): AnnouncementAudience {
	return role ?? "anon";
}

/**
 * Clave del descarte local, POR AUDIENCIA. Es lo que impide que un `info`
 * dirigido a la audiencia anterior siga descartado cuando la persona cambia de
 * rol en el mismo dispositivo: pasa de `business` a `consumer`, la clave cambia,
 * y los avisos del otro rol vuelven a estar pendientes.
 *
 * El `.v1` es el de la forma del valor (un arreglo de ids JSON), como en las
 * otras claves de AsyncStorage del repo. Si algún día cambia la forma, la clave
 * nueva deja de leer la vieja en vez de interpretarla.
 */
export function localDismissalKey(audience: AnnouncementAudience): string {
	return `role.announcements.dismissed.v1:${audience}`;
}

/**
 * Tope del descarte local. Un `info` por semana durante diez años son ~520 uuids
 * y unos veinte KB: no es un problema de espacio, es que la key no tiene por
 * qué crecer para siempre. Lo que se cae es lo más viejo, y es el aviso que
 * menos falta hace —un `info` viejo ya no está `active`, así que la policy ni
 * siquiera lo devuelve y nunca vuelve a aparecer.
 */
export const MAX_LOCAL_DISMISSALS = 200;

/**
 * Toma los avisos ya elegibles y ya ordenados por la consulta, saca lo que la
 * persona ya resolvió, y devuelve la secuencia de modales: los `required` de a
 * uno y primero, el lote de `info` al final (D9 y D10).
 *
 * Cada set se consulta SOLO para su severidad: los `acknowledgedIds` son el
 * acknowledgement en servidor y existen para los `required`; los `dismissedIds`
 * son el descarte local y existe para los `info`. Un `required` no se busca en
 * el set local porque un descarte de dispositivo no puede marcar un obligatorio
 * como entendido —eso lo hace la fila—, y un `info` no se busca en el de
 * servidor porque no tiene acknowledgement.
 *
 * Si un `required` llega con el id en el set local, aparece: el operador
 * degradó un `info` a `required` y volver a mostrárselo hasta que lo registre
 * es lo único que evita el loop eterno de un obligatorio que nadie puede
 * entender.
 */
export function buildModalSequence(
	announcements: Announcement[],
	acknowledgedIds: ReadonlySet<string>,
	dismissedIds: ReadonlySet<string>,
): AnnouncementModal[] {
	const required: Announcement[] = [];
	const info: Announcement[] = [];

	for (const announcement of announcements) {
		if (announcement.severity === "required") {
			// Sin condición, se cuela el `required` ya entendido y vuelve a
			// ocupar un modal en cada apertura.
			if (acknowledgedIds.has(announcement.id)) continue;
			required.push(announcement);
			continue;
		}
		if (dismissedIds.has(announcement.id)) continue;
		info.push(announcement);
	}

	const modals: AnnouncementModal[] = required.map((announcement) => ({
		kind: "required",
		announcement,
	}));
	// El lote se agrega solo si quedó algo: un modal de `info` sin contenido
	// todavía contaría para el `conMax` del dominio y sería un modal vacío en
	// pantalla.
	if (info.length > 0) modals.push({ kind: "info", announcements: info });
	return modals;
}

/**
 * El modal que el layout tiene que abrir ahora: el primero de la cola, o
 * `null` si no hay nada.
 *
 * Sale de acá y no inline en el layout por una razón comprobable: la decisión
 * de "cuál de los varios se muestra" es la que sostiene en pantalla el orden de
 * D9 y D10, y leerla del JSX del layout significa que solo se puede ejercitar
 * montando React con el router de Expo encima. Con una función, el caso se lee.
 *
 * POR QUÉ "EL PRIMERO" Y NO "EL MÁS IMPORTANTE": el orden de la cola YA está
 * decidido —los `required` de a uno y primero, el lote de `info` al final—, así
 * que recorrerla en orden es exactamente respetar esa decisión sin duplicarla.
 * Un `max` por prioridad acá sería una tercera copia de la regla, y de las tres
 * copias solo se corrige la que nadie mira.
 *
 * Y POR QUÉ NO HAY UN ÍNDICE QUE SE ADVANCE A MANO: el acknowledgement saca su
 * modal de la cola, así que el siguiente aparece solo. Un puntero externo capaz
 * de desincronizarse de la cola es una clase entera de fallas —se saltea un
 * `required`, o se queda mostrando uno ya entendido— y ninguna se comprueba
 * hasta que alguien la ve en la app.
 */
export function firstPendingModal(
	modals: AnnouncementModal[],
): AnnouncementModal | null {
	return modals[0] ?? null;
}

/**
 * La identidad estable de un modal, para usarlo de `key` al montarlo.
 *
 * ES LA `key` Y NO EL ÍNDICE, y la razón es que el modal tiene estado interno: la
 * página del lote de `info` y el "escondido sin resolver" del `required`. Con la
 * key por índice, sacar el primer aviso de la cola reutiliza el nodo del
 * anterior con el estado del anterior, y un `info` de tres páginas que se
 * reordena por prioridad dejaría mostrando la página 3 de una lista nueva.
 *
 * La del lote es el id de su PRIMER aviso, y no la concatenación de todos: dos
 * lotes distintos casi nunca coinciden en su primer aviso, y la concatenación le
 * pagaría a React una comparación de todos los ids en cada reordenada.
 */
export function modalIdentity(modal: AnnouncementModal): string {
	if (modal.kind === "required") return `required:${modal.announcement.id}`;
	const primero = modal.announcements[0]?.id;
	// Un lote vacío es un valor que el TIPO permite y que el dominio no arma. Su
	// identidad no la define ningún aviso, así que se le da una constante: la
	// `key` tiene que ser un string, y `undefined` como key de React es un
	// warning en vez de un comportamiento.
	return primero ? `info:${primero}` : "info:";
}

/**
 * Saca de una secuencia los `info` que se acaba de descartar en el dispositivo.
 *
 * Es la mitad optimista del descarte: la persona apretó "cerrar" y el modal
 * tiene que desaparecer en el acto, sin esperar un viaje a la base que para un
 * `info` ni siquiera existe —no hay fila, es un id guardado en AsyncStorage—.
 *
 * Los `required` no salen por acá: ese acknowledgement lo escribe el servidor,
 * o no sale nunca.
 */
export function applyLocalDismissal(
	modals: AnnouncementModal[],
	dismissedIds: ReadonlySet<string>,
): AnnouncementModal[] {
	const remaining: AnnouncementModal[] = [];
	for (const modal of modals) {
		if (modal.kind === "required") {
			remaining.push(modal);
			continue;
		}
		const announcements = modal.announcements.filter(
			(announcement) => !dismissedIds.has(announcement.id),
		);
		if (announcements.length > 0)
			remaining.push({ kind: "info", announcements });
	}
	return remaining;
}

/**
 * Saca de la secuencia el `required` que la persona acaba de registrar.
 *
 * Se aplica DESPUÉS de que el servidor confirme el acknowledgement, no antes: si
 * la escritura falla, el obligatorio tiene que seguir en la cola, porque no
 * entenderlo y que vuelva a aparecer es mejor que mostrarlo como entendido y que
 * no vuelva nunca.
 *
 * No se toca el lote de `info`: ese sale por descarte local, y son dos stores
 * distintos para dos severidades distintas.
 */
export function applyAcknowledgement(
	modals: AnnouncementModal[],
	acknowledgedId: string,
): AnnouncementModal[] {
	return modals.filter(
		(modal) =>
			modal.kind !== "required" || modal.announcement.id !== acknowledgedId,
	);
}
