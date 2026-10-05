import { beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Announcement } from "@0xc1x/role-commons";

// El hook es lo que convierte la secuencia agrupada en "qué ve la persona, en
// qué orden y cuándo se va". Estos casos fijan las tres decisiones: D7 (la
// apertura no depende de la consulta), el acknowledgement sale de la cola solo
// cuando el servidor confirma, y el descarte de `info` no espera a la red.

const fetchPendingAnnouncements = jest.fn(
	(): Promise<Announcement[]> => Promise.resolve([]),
);
const fetchAcknowledgedIds = jest.fn(
	(): Promise<ReadonlySet<string>> => Promise.resolve(new Set()),
);
const fetchDismissedIdsLocally = jest.fn(
	(): Promise<ReadonlySet<string>> => Promise.resolve(new Set()),
);
const acknowledgeAnnouncement = jest.fn((): Promise<void> => Promise.resolve());
const dismissAnnouncementsLocally = jest.fn(
	(): Promise<void> => Promise.resolve(),
);

mock.module("@/src/features/announcements/data/repository", () => ({
	fetchPendingAnnouncements,
	fetchAcknowledgedIds,
	fetchDismissedIdsLocally,
	acknowledgeAnnouncement,
	dismissAnnouncementsLocally,
	currentAudience: () => "user",
}));

/**
 * Estado de la sesión que el store falseo devuelve. `PERFIL` tiene `id` porque
 * el `queryKey` lo necesita: sin persona en la clave, una sesión cerrada en el
 * mismo dispositivo dejaría la cola de la anterior viva en el caché.
 */
interface SesionFalsa {
	initialized: boolean;
	profile: { id: string; role: "user" | "business" } | null;
}

let initialized = true;
let sesion: SesionFalsa["profile"] = {
	id: "b0000000-0000-4000-8000-000000000001",
	role: "user",
};

mock.module("@/src/features/auth/store", () => ({
	useAuthStore: (selector: (state: SesionFalsa) => unknown) =>
		selector({ initialized, profile: sesion }),
}));

const {
	announcementModalSequenceOptions,
	announcementQueryKey,
	fetchAnnouncementModalSequence,
	useAnnouncementModals,
} = await import("./hooks");
const { buildModalSequence } = await import("./domain/announcement");

const REQUIRED: Announcement = {
	id: "a0000000-0000-4000-8000-000000000001",
	title: "Actualizá tus datos",
	body: "Necesitamos tu teléfono para avisarte de las reservas.",
	severity: "required",
	audience_kind: "all",
	priority: 5,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};
const INFO: Announcement = {
	...REQUIRED,
	id: "a0000000-0000-4000-8000-000000000002",
	severity: "info",
	priority: 1,
};

type Secuencia = ReturnType<typeof buildModalSequence>;

interface Api {
	modals: Secuencia;
	acknowledge: (id: string) => Promise<void>;
	dismissInfo: (ids: string[]) => void;
}

const PERSONA = "b0000000-0000-4000-8000-000000000001";
const CLAVE = () => announcementQueryKey("user", PERSONA);

/**
 * Monta el hook en un QueryClient real y devuelve lo que expone más el cliente,
 * para poder observar el caché. `renderToStaticMarkup` ejecuta el cuerpo del
 * componente una vez: alcanza para leer lo que el hook devuelve y para disparar
 * sus callbacks, que es todo lo que se afirma acá.
 *
 * `sembrar` se aplica ANTES de montar, y no después a propósito: el hook lee
 * `query.data` durante ese único render, así que una siembra posterior solo
 * llegaría al caché y nunca a `api.modals`. Los casos que necesitan una cola
 * punya la sembrar antes por esa razón, y no por comodidad.
 */
function monta(sembrar?: (client: QueryClient) => void): {
	api: Api;
	client: QueryClient;
} {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	sembrar?.(client);
	const holder: { api: Api | null } = { api: null };
	function Probe() {
		holder.api = useAnnouncementModals();
		return null;
	}
	renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, createElement(Probe)),
	);
	if (!holder.api) throw new Error("el hook no llegó a montarse");
	return { api: holder.api, client };
}

/**
 * Monta el hook con la secuencia YA en el caché.
 *
 * El orden importa y es la mitad de lo que se verifica: la siembra va antes del
 * render, así que `api.modals` y `leer()` miran lo mismo. Con la siembra después,
 * `api.modals` seguiría reflejando el estado previo y cualquier aserción sobre
 * la salida del hook sería un test que no puede fallar.
 */
function conCola(
	anuncios: Announcement[],
	acknowledged: string[] = [],
	dismissed: string[] = [],
): { api: Api; client: QueryClient; leer: () => Secuencia | undefined } {
	const secuencia = buildModalSequence(
		anuncios,
		new Set(acknowledged),
		new Set(dismissed),
	);
	const { api, client } = monta((c) => c.setQueryData(CLAVE(), secuencia));
	return { api, client, leer: () => client.getQueryData(CLAVE()) };
}

beforeEach(() => {
	initialized = true;
	sesion = { id: PERSONA, role: "user" };
	// `mockReset` y no `mockClear`: el comportamiento por defecto se restituye
	// también, así que una implementación que dejó un caso fallando no se
	// arrastra al siguiente y un test que no puede fallar.
	fetchPendingAnnouncements.mockReset().mockResolvedValue([]);
	fetchAcknowledgedIds.mockReset().mockResolvedValue(new Set());
	fetchDismissedIdsLocally.mockReset().mockResolvedValue(new Set());
	acknowledgeAnnouncement.mockReset().mockResolvedValue(undefined);
	dismissAnnouncementsLocally.mockReset().mockResolvedValue(undefined);
});

describe("D7: la apertura de la app no depende de la consulta", () => {
	test("sin datos todavía no hay modales, y la app abre igual", () => {
		// El primer render de la app pasa por acá: la consulta recién arrancó. Si
		// esto no fuera `[]`, el modal aparecería antes de que la consulta haya
		// dicho nada — y con la audiencia de una sesión sin resolver.
		const { api } = monta();

		expect(api.modals).toEqual([]);
	});

	test("sin sesión resuelta no se consulta", () => {
		// La consulta espera a que el store termine: antes no hay audiencia que
		// valga y la lectura sería de anon, que después se repite.
		initialized = false;
		monta();

		expect(fetchPendingAnnouncements).not.toHaveBeenCalled();
		expect(fetchAcknowledgedIds).not.toHaveBeenCalled();
		expect(fetchDismissedIdsLocally).not.toHaveBeenCalled();
	});

	test("la clave del caché lleva la audiencia de la sesión", () => {
		sesion = { id: PERSONA, role: "business" };
		const { client } = monta();

		// Con el rol en el `queryKey`, cambiar de rol en el mismo dispositivo es un
		// caché distinto: el consumidor no hereda la cola que el mismo teléfono
		// descartó siendo de negocio, ni al revés.
		const claveNegocio = announcementQueryKey("business", PERSONA);
		expect(claveNegocio).toContain("business");
		expect(client.getQueryData(claveNegocio)).toBeUndefined();
	});

	test("la clave del caché lleva la persona, no solo la audiencia", () => {
		// La falla que esto tapa: `announcement_acknowledgements` es por
		// `(announcement_id, user_id)`, así que la cola de una persona NO es la de
		// otra aunque compartan rol y dispositivo. Con una sesión cerrada sin
		// logout —revocada desde otro lado, refresh token invalidado— el `store.ts`
		// limpia el store y NO el query client, así que la entrada sobrevive los
		// `gcTime` y la siguiente persona en hereda. Un `required` que ella nunca
		// registró le quedaría invisible: la falla inversa exacta a la que la
		// migración prohíbe ("un required tiene que volver en cada apertura hasta
		// que la persona lo entienda").
		expect(announcementQueryKey("user", "ana-1")).not.toEqual(
			announcementQueryKey("user", "beto-2"),
		);
	});

	test("dos personas con el mismo rol no comparten la cola en el caché", () => {
		const B = "b0000000-0000-4000-8000-000000000002";
		const colaDeAna = buildModalSequence([REQUIRED], new Set(), new Set());
		const claveAna = announcementQueryKey("user", PERSONA);

		// Ana dejó su `required` registrado en el servidor; Beto abre la app en el
		// mismo teléfono, con el mismo rol. La entrada de Ana está viva en el caché
		// —y lo va a estar `gcTime`— así que la de Beto tiene que ser OTRA
		// entrada: si no, el modal de Beto no le muestra un aviso que él nunca
		// entendió, y ese `required` ya no vuelve nunca porque la fila de Ana lo
		// sacó de la cola de él también.
		const { client } = monta((c) => c.setQueryData(claveAna, colaDeAna));

		expect(client.getQueryData<Secuencia>(claveAna)).toEqual(colaDeAna);
		expect(
			client.getQueryData<Secuencia>(announcementQueryKey("user", B)),
		).toBeUndefined();
	});

	test("sin sesión la persona es `anon`, no un id vacío", () => {
		// Una clave con `""` o `undefined` como id sería igual de válida para React
		// Query y mucho más difícil de leer en un log de caché.
		expect(announcementQueryKey("anon", null)).toEqual(
			announcementQueryKey("anon", "anon"),
		);
		expect(announcementQueryKey("anon", null)).not.toEqual(
			announcementQueryKey("anon", PERSONA),
		);
	});

	test("D7 vive en las opciones: sin retry y sin throwOnError", () => {
		const opciones = announcementModalSequenceOptions("user", PERSONA, true);

		// El default global reintenta una vez. Si este `false` se va, un `required`
		// que falló se reintenta diferido y aparece solo, sin que la persona haya
		// vuelto a abrir la app.
		expect(opciones.retry).toBe(false);
		// `throwOnError` sube el fallo por el árbol y se lleva la pantalla que
		// monta este hook. Su ausencia ES el comportamiento de D7.
		expect(opciones.throwOnError).toBeUndefined();
		expect(opciones.queryFn).toBe(fetchAnnouncementModalSequence);
		expect(opciones.enabled).toBe(true);
	});

	test("sin sesión resuelta la consulta queda deshabilitada", () => {
		// No alcanza con que el hook no dispare nada: si la consulta quedara
		// habilitada y sólo no se disparara hoy, un `refetch` desde otro lado
		// arrancaría con el anon key y traería avisos de otra audiencia.
		expect(
			announcementModalSequenceOptions("user", PERSONA, false).enabled,
		).toBe(false);
	});
});

describe("modals es lo que el hook devuelve, no solo lo que hay en el caché", () => {
	test("modals es la secuencia agrupada que arma buildModalSequence", () => {
		// LA COSTURA. `buildModalSequence` tiene su propio archivo de tests y
		// `fetchAnnouncementModalSequence` tiene los suyos, cada uno mirando su
		// mitad: la función llega al caché y el caché llega al hook. Nadie miraba
		// `modals`, que es el valor público, así que una línea que lo transformara
		// —`.slice(1)`, un `filter` por kind— no rompía nada. Con la siembra antes
		// del render, `api.modals` y el caché dicen lo mismo y el hueco se cierra.
		const { api } = monta((c) =>
			c.setQueryData(
				CLAVE(),
				buildModalSequence([REQUIRED, INFO], new Set(), new Set()),
			),
		);

		expect(api.modals.map((m) => m.kind)).toEqual(["required", "info"]);
		// Y con la forma exacta, no solo los kinds: el `required` va suelto y el
		// lote de `info` con su aviso adentro.
		expect(
			api.modals[0]?.kind === "required" && api.modals[0].announcement.id,
		).toBe(REQUIRED.id);
		expect(
			api.modals[1]?.kind === "info" &&
				api.modals[1].announcements.map((a) => a.id),
		).toEqual([INFO.id]);
	});
});

describe("los tres insumos se leen juntos y se agrupan", () => {
	test("la secuencia sale de lo que la base, el servidor y el disco trajeron", async () => {
		fetchPendingAnnouncements.mockResolvedValue([REQUIRED, INFO]);
		fetchAcknowledgedIds.mockResolvedValue(new Set());
		fetchDismissedIdsLocally.mockResolvedValue(new Set());

		const modales = await fetchAnnouncementModalSequence();

		// `required` de a uno y primero, el lote de `info` después: la secuencia
		// exacta que el modal del layout va a abrir.
		expect(modales.map((m) => m.kind)).toEqual(["required", "info"]);
		expect(fetchPendingAnnouncements).toHaveBeenCalledTimes(1);
		expect(fetchAcknowledgedIds).toHaveBeenCalledTimes(1);
		expect(fetchDismissedIdsLocally).toHaveBeenCalledTimes(1);
	});

	test("lo ya entendido y lo ya descartado no llegan a la secuencia", async () => {
		fetchPendingAnnouncements.mockResolvedValue([REQUIRED, INFO]);
		fetchAcknowledgedIds.mockResolvedValue(new Set([REQUIRED.id]));
		fetchDismissedIdsLocally.mockResolvedValue(new Set([INFO.id]));

		expect(await fetchAnnouncementModalSequence()).toEqual([]);
	});

	test("un fallo de uno de los tres falla la consulta entera", async () => {
		// Un fallo parcial produciría una secuencia con los `required` pero sin los
		// `info` descartados —o al revés— y eso se vería como "ya los leí" para un
		// lote que la persona nunca abrió. Es mejor no mostrar nada (D7) que
		// mostrar una cola a medias.
		fetchPendingAnnouncements.mockResolvedValue([REQUIRED, INFO]);
		fetchDismissedIdsLocally.mockRejectedValue(new Error("sin red"));

		await expect(fetchAnnouncementModalSequence()).rejects.toThrow();
	});
});

describe("entender un required lo saca de la cola", () => {
	test("escribe el acknowledgement y recién ahí lo saca", async () => {
		let liberar: () => void = () => {};
		acknowledgeAnnouncement.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					liberar = resolve;
				}),
		);
		const { api, leer } = conCola([REQUIRED, INFO]);

		const pendiente = api.acknowledge(REQUIRED.id);
		// Antes de que el servidor confirme, el obligatorio sigue en la cola: si
		// saliera al instante y la escritura fallara, la persona cerraría un aviso
		// que nunca quedó registrado — y como no hay forma de des-acknowledgear,
		// no volvería a verlo nunca.
		expect(leer()?.map((m) => m.kind)).toEqual(["required", "info"]);

		liberar();
		await pendiente;

		expect(acknowledgeAnnouncement).toHaveBeenCalledWith(REQUIRED.id);
		expect(leer()?.map((m) => m.kind)).toEqual(["info"]);
	});

	test("si la escritura falla, el required se queda en la cola", async () => {
		acknowledgeAnnouncement.mockRejectedValue(new Error("sin red"));
		const { api, leer } = conCola([REQUIRED, INFO]);

		await expect(api.acknowledge(REQUIRED.id)).rejects.toThrow();

		expect(leer()?.map((m) => m.kind)).toEqual(["required", "info"]);
	});

	test("entender el último required deja la secuencia vacía", async () => {
		const { api, leer } = conCola([REQUIRED]);

		await api.acknowledge(REQUIRED.id);

		expect(leer()).toEqual([]);
	});
});

describe("descartar el lote de info es local y no espera a la red", () => {
	test("el modal sale al instante y el descarte va detrás", () => {
		const { api, leer } = conCola([REQUIRED, INFO]);

		api.dismissInfo([INFO.id]);

		// Sin `await`: un `info` no tiene fila en la base, así que esperar una
		// relectura sería hacer esperar a la persona por un gesto que ya no
		// necesita red.
		expect(leer()?.map((m) => m.kind)).toEqual(["required"]);
		expect(dismissAnnouncementsLocally).toHaveBeenCalledWith([INFO.id]);
	});

	test("descartar el lote entero saca el modal de info y deja el required", () => {
		const { api, leer } = conCola([REQUIRED, INFO]);

		api.dismissInfo([INFO.id, "a0000000-0000-4000-8000-0000000000ff"]);

		expect(leer()?.map((m) => m.kind)).toEqual(["required"]);
	});

	test("sin lote de info, descartar no cambia nada", () => {
		const { api, leer } = conCola([REQUIRED]);

		api.dismissInfo([INFO.id]);

		// Un id que no está en la secuencia no inventa ni borra modales: el
		// descarte llega desde el propio lote que se mostró.
		expect(leer()?.map((m) => m.kind)).toEqual(["required"]);
	});
});
