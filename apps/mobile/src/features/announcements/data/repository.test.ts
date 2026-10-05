import { beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { AnnouncementSchema } from "@0xc1x/role-commons";

// El módulo real de supabase arranca timers que tocan window.localStorage.
const memstore = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window ??= {
	localStorage: {
		getItem: (k: string) => memstore.get(k) ?? null,
		setItem: (k: string, v: string) => void memstore.set(k, v),
		removeItem: (k: string) => void memstore.delete(k),
	},
};

const storage = new Map<string, string>();
let storageFallaEn: "getItem" | "setItem" | null = null;

mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: jest.fn(async (key: string) => {
			if (storageFallaEn === "getItem") throw new Error("storage caído");
			return storage.get(key) ?? null;
		}),
		setItem: jest.fn(async (key: string, value: string) => {
			if (storageFallaEn === "setItem") throw new Error("storage caído");
			storage.set(key, value);
		}),
		removeItem: jest.fn(async (key: string) => {
			storage.delete(key);
		}),
	},
}));

// El store se falsea entero en vez de usar zustand de verdad: lo único que este
// feature le pide es el rol de la sesión, que es el que decide la audiencia del
// descarte local.
let rolEnSesion: "user" | "business" | "admin" | null = "user";
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({
			profile: rolEnSesion === null ? null : { role: rolEnSesion },
		}),
	},
}));

const fromMock = jest.fn();
const getUserMock = jest.fn();

mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: fromMock,
		auth: { getUser: getUserMock },
	},
}));

// Los mocks deben registrarse antes de cargar el repositorio.
const {
	acknowledgeAnnouncement,
	currentAudience,
	dismissAnnouncementsLocally,
	dismissRequiredAnnouncementLocally,
	fetchAcknowledgedIds,
	fetchDismissedIdsLocally,
	fetchDismissedRequiredIdsLocally,
	fetchPendingAnnouncements,
} = await import("@/src/features/announcements/data/repository");
const { localDismissalKey, localRequiredDismissalKey, MAX_LOCAL_DISMISSALS } =
	await import("@/src/features/announcements/domain/announcement");

const USER_ID = "b0000000-0000-4000-8000-00000000000f";
const AVISO = {
	id: "a0000000-0000-4000-8000-000000000001",
	title: "Mantenimiento el domingo",
	body: "La app no va a estar disponible entre las 3 y las 5.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};
const AVISO_2 = { ...AVISO, id: "a0000000-0000-4000-8000-000000000002" };

interface Llamada {
	method: string;
	args: unknown[];
}

/**
 * Doble de la cadena de PostgREST: cada método registra su llamada y devuelve
 * la misma cadena, y la cadena es `thenable` porque el repositorio la espera.
 */
class Cadena {
	readonly llamadas: Llamada[] = [];
	private readonly resultado: { data: unknown; error: unknown };

	constructor(resultado: { data: unknown; error: unknown }) {
		this.resultado = resultado;
	}

	private registra(method: string, args: unknown[]): this {
		this.llamadas.push({ method, args });
		return this;
	}

	select(...args: unknown[]): this {
		return this.registra("select", args);
	}

	order(...args: unknown[]): this {
		return this.registra("order", args);
	}

	eq(...args: unknown[]): this {
		return this.registra("eq", args);
	}

	insert(...args: unknown[]): this {
		return this.registra("insert", args);
	}

	upsert(...args: unknown[]): this {
		return this.registra("upsert", args);
	}

	// biome-ignore lint/suspicious/noThenProperty: doble thenable intencional
	then<F, R>(
		onCumplido:
			| ((value: { data: unknown; error: unknown }) => F | PromiseLike<F>)
			| null,
		onRechazado: ((reason: unknown) => R | PromiseLike<R>) | null,
	): Promise<F | R> {
		return Promise.resolve(this.resultado).then(onCumplido, onRechazado);
	}
}

/** Tablas consultadas y la cadena que devolvió cada una, en orden. */
let consulted: { tabla: string; cadena: Cadena }[] = [];

/**
 * Programa la respuesta de la próxima consulta. La tabla NO es un parámetro a
 * propósito: cada caso afirma sobre `consulted` qué tabla se tocó, y si el
 * repositorio consultara otra de la que el caso cree, esa aserción lo delata.
 */
function responde(resultado: { data: unknown; error: unknown }) {
	fromMock.mockImplementation((nombre: string) => {
		const cadena = new Cadena(resultado);
		consulted.push({ tabla: nombre, cadena });
		return cadena;
	});
}

/** Todas las llamadas registradas, de cualquier tabla. */
function llamadas(): Llamada[] {
	return consulted.flatMap((c) => c.cadena.llamadas);
}

beforeEach(() => {
	consulted = [];
	storage.clear();
	storageFallaEn = null;
	rolEnSesion = "user";
	fromMock.mockReset();
	getUserMock.mockReset();
	getUserMock.mockResolvedValue({
		data: { user: { id: USER_ID } },
		error: null,
	});
	responde({ data: [], error: null });
});

describe("la lectura de los avisos deja la elegibilidad a la policy", () => {
	test("pide las columnas del contrato de lectura y ninguna más", async () => {
		responde({ data: [AVISO], error: null });

		await fetchPendingAnnouncements();

		const select = llamadas().find((c) => c.method === "select");
		const pedidas = String(select?.args[0])
			.split(",")
			.map((c) => c.trim());
		// Derivadas del contrato, no escritas a mano: si commons agrega un campo,
		// el select lo trae; y como `user_ids`/`business_ids` NO están en el
		// contrato, no hay forma de que el select los pida.
		expect(pedidas.sort()).toEqual(
			Object.keys(AnnouncementSchema.shape).sort(),
		);
		expect(pedidas).not.toContain("user_ids");
		expect(pedidas).not.toContain("business_ids");
	});

	test("ordena por priority desc y created_at desc, y no filtra nada", async () => {
		await fetchPendingAnnouncements();

		expect(llamadas().filter((c) => c.method === "order")).toEqual([
			{ method: "order", args: ["priority", { ascending: false }] },
			{ method: "order", args: ["created_at", { ascending: false }] },
		]);
		// Ni `active`, ni la ventana, ni `audience_kind`: los cinco términos del
		// USING son de la policy y un filtro equivalente acá sería la segunda
		// copia de la misma regla —de las dos, solo se corrige la que nadie mira—
		// y el `now()` del cliente puede discrepar del reloj del servidor.
		expect(llamadas().some((c) => c.method === "eq")).toBe(false);
	});

	test("devuelve los avisos ya validados por el contrato", async () => {
		responde({ data: [AVISO, AVISO_2], error: null });

		const avisos = await fetchPendingAnnouncements();

		expect(avisos).toHaveLength(2);
		expect(avisos[0]?.id).toBe(AVISO.id);
		expect(avisos[1]?.severity).toBe("info");
	});

	test("una fila que el contrato no acepta no llega a la pantalla", async () => {
		// `title` tiene CHECK `char_length between 3 and 120` en la base, así que
		// esta rama es prácticamente inalcanzable por la vía normal; por eso vale
		// un fallo ruidoso y no una lista a medias que esconda un `required`.
		responde({
			data: [{ ...AVISO, priority: "cinco" }],
			error: null,
		});

		await expect(fetchPendingAnnouncements()).rejects.toThrow();
	});

	test("una fila inválida hunde la lectura entera, no solo esa fila", async () => {
		// Un `catch` por fila devolvería el resto del lote, y la persona vería
		// entrar un modal con la mitad de los avisos —con el `required` capaz de
		// ser justo el que se cayó. No mostrar nada (D7) es más honesto que
		// mostrar una cola a medias sin avisar.
		responde({
			data: [AVISO, { ...AVISO_2, severity: "critico" }, AVISO],
			error: null,
		});

		await expect(fetchPendingAnnouncements()).rejects.toThrow();
	});

	test("el fallo de contrato llega a Sentry con el campo que falló", async () => {
		responde({
			data: [{ ...AVISO, priority: "cinco" }],
			error: null,
		});

		// El `kind` `unknown` es lo que hace que el QueryCache lo reporte, así que
		// el evento llega —pero un ZodError desnudo dice "algo falló" y no dice
		// dónde. Los `issues` en el `context` son lo que lo hace accionable sin
		// reproducir: sin ellos, triage empieza por adivinar la columna.
		let caught: { kind?: string; code?: string; context?: unknown } = {};
		try {
			await fetchPendingAnnouncements();
		} catch (error) {
			caught = error as { kind?: string; code?: string; context?: unknown };
		}
		expect(caught.kind).toBe("unknown");
		expect(caught.code).toBe("ANNOUNCEMENT_INVALID_ROW");
		const contexto = caught.context as { issues?: unknown } | undefined;
		expect(Array.isArray(contexto?.issues)).toBe(true);
		expect(JSON.stringify(contexto?.issues)).toContain("priority");
	});

	test("un error de la base se propaga ya tipado", async () => {
		responde({
			data: null,
			error: {
				code: "42501",
				message: "permission denied for table announcements",
			},
		});

		await expect(fetchPendingAnnouncements()).rejects.toMatchObject({
			kind: "forbidden",
			// El mensaje crudo del driver nombra la tabla y viaja solo en `context`.
			message: expect.not.stringContaining("announcements"),
		});
	});
});

describe("los acknowledgements ya registrados", () => {
	test("lee los ids del servidor sin filtrar por usuario", async () => {
		responde({
			data: [{ announcement_id: AVISO.id }, { announcement_id: AVISO_2.id }],
			error: null,
		});

		const ids = await fetchAcknowledgedIds();

		expect(ids.has(AVISO.id)).toBe(true);
		expect(ids.has(AVISO_2.id)).toBe(true);
		// `using (user_id = auth.uid())`: la fila de otro usuario no llega, y
		// repetir el filtro acá sería una segunda copia de la policy.
		expect(llamadas().some((c) => c.method === "eq")).toBe(false);
		expect(consulted.map((c) => c.tabla)).toEqual([
			"announcement_acknowledgements",
		]);
	});

	test("sin acknowledgements devuelve el set vacío, no undefined", async () => {
		responde({ data: [], error: null });

		expect(await fetchAcknowledgedIds()).toEqual(new Set());
	});
});

describe("el acknowledgement se escribe directo a Supabase", () => {
	test("escribe la fila con el user_id de la sesión", async () => {
		await acknowledgeAnnouncement(AVISO.id);

		const escritura = llamadas().find((c) => c.method === "upsert");
		expect(consulted.map((c) => c.tabla)).toEqual([
			"announcement_acknowledgements",
		]);
		// `user_id` es NOT NULL sin default y sin trigger que lo selle, así que
		// tiene que viajar. Lo que NO viaja es un id cualquiera: el de la sesión.
		expect(escritura?.args[0]).toEqual({
			announcement_id: AVISO.id,
			user_id: USER_ID,
		});
	});

	test("no crece al reintentar: el conflicto se ignora en la propia escritura", async () => {
		await acknowledgeAnnouncement(AVISO.id);

		const escritura = llamadas().find((c) => c.method === "upsert");
		// La PK es (announcement_id, user_id) y la tabla NO tiene policy de UPDATE
		// ni de DELETE: con un `insert` reintentado (doble toque, corte de red)
		// el segundo moriría con 23505. `ON CONFLICT DO NOTHING` hace que el
		// reintento sea un no-op sin pedir un permiso que la tabla no da.
		expect(escritura?.args[1]).toEqual({
			onConflict: "announcement_id,user_id",
			ignoreDuplicates: true,
		});
		// Y que la escritura sea un `upsert` y no un `insert`: la idempotencia
		// tiene que estar en la propia consulta, no en un `try/catch` que traga el
		// 23505 y declare un acknowledgement escrito que no existe.
		expect(escritura).toBeDefined();
		expect(llamadas().some((c) => c.method === "insert")).toBe(false);
	});

	test("escribir dos veces el mismo acknowledgement no crece la fila", async () => {
		// El `ignoreDuplicates` no se comprueba contra la base acá sino contra la
		// forma de la consulta: `ON CONFLICT DO NOTHING` sobre la PK compuesta es
		// lo que hace que el segundo toque sea un no-op, y la fila sigue siendo
		// una. La otra mitad de la garantía —que el aviso no vuelva— la sostiene
		// `announcements.rls.db.spec.ts`, que sí habla con la base.
		await acknowledgeAnnouncement(AVISO.id);
		await acknowledgeAnnouncement(AVISO.id);

		const escrituras = llamadas().filter((c) => c.method === "upsert");
		expect(escrituras).toHaveLength(2);
		for (const escritura of escrituras) {
			expect(escritura.args[1]).toEqual({
				onConflict: "announcement_id,user_id",
				ignoreDuplicates: true,
			});
		}
	});

	test("sin sesión no se intenta escribir", async () => {
		getUserMock.mockResolvedValue({ data: { user: null }, error: null });

		await expect(acknowledgeAnnouncement(AVISO.id)).rejects.toMatchObject({
			kind: "unauthorized",
		});
		expect(llamadas()).toHaveLength(0);
	});

	test("un error de escritura no se traga: el modal no puede cerrar en falso", async () => {
		responde({
			data: null,
			error: {
				code: "42501",
				message: "new row violates row-level security policy",
			},
		});

		await expect(acknowledgeAnnouncement(AVISO.id)).rejects.toThrow();
	});
});

describe("el descarte local de los info es POR AUDIENCIA", () => {
	test("guarda bajo la clave de la audiencia de la sesión", async () => {
		await dismissAnnouncementsLocally([AVISO.id]);

		expect(currentAudience()).toBe("user");
		expect(storage.get(localDismissalKey("user"))).toBe(
			JSON.stringify([AVISO.id]),
		);
		expect(await fetchDismissedIdsLocally()).toEqual(new Set([AVISO.id]));
	});

	test("cambiar de rol en el mismo dispositivo abre la audiencia nueva", async () => {
		await dismissAnnouncementsLocally([AVISO.id]);

		rolEnSesion = "business";
		// El `info` que el operador dirigió a los negocios no puede quedar
		// descartado para la audiencia de negocios solo porque antes era
		// consumidor: son audiencias distintas, con avisos distintos.
		expect(currentAudience()).toBe("business");
		expect(await fetchDismissedIdsLocally()).toEqual(new Set());

		rolEnSesion = "user";
		expect(await fetchDismissedIdsLocally()).toEqual(new Set([AVISO.id]));
	});

	test("sin sesión la audiencia es `anon`, no `user`", async () => {
		rolEnSesion = null;

		await dismissAnnouncementsLocally([AVISO.id]);

		// El anónimo no puede ver ningún `required` —la policy se lo saca— y no
		// puede acknowledge, así que su descarte no es el de un usuario.
		expect(currentAudience()).toBe("anon");
		expect(storage.has(localDismissalKey("anon"))).toBe(true);
		expect(storage.has(localDismissalKey("user"))).toBe(false);
	});

	test("acumula los descartes sin duplicar ni perder lo anterior", async () => {
		await dismissAnnouncementsLocally([AVISO.id]);
		await dismissAnnouncementsLocally([AVISO_2.id, AVISO.id]);

		expect(await fetchDismissedIdsLocally()).toEqual(
			new Set([AVISO.id, AVISO_2.id]),
		);
		// Un id repetido no ocupa dos lugares en la key.
		expect(storage.get(localDismissalKey("user"))).toBe(
			JSON.stringify([AVISO.id, AVISO_2.id]),
		);
	});

	test("el conjunto no crece sin límite y conserva lo más reciente", async () => {
		const muchos = Array.from(
			{ length: MAX_LOCAL_DISMISSALS + 10 },
			(_, i) => `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);

		await dismissAnnouncementsLocally(muchos);

		// Sin tope, la key de AsyncStorage crece con cada `info` descartado y no
		// tiene término: no es un problema de espacio hoy, es una key que nunca
		// deja de crecer.
		const guardados = await fetchDismissedIdsLocally();
		expect(guardados.size).toBe(MAX_LOCAL_DISMISSALS);
		expect(guardados.size).toBeLessThan(muchos.length);
		// Lo que se cae es lo más viejo, que es el aviso que menos falta hace.
		expect(guardados.has(muchos[0] ?? "")).toBe(false);
		expect(guardados.has(muchos[muchos.length - 1] ?? "")).toBe(true);
	});

	test("un storage roto no rompe: se trata como nada descartado", async () => {
		storageFallaEn = "getItem";
		expect(await fetchDismissedIdsLocally()).toEqual(new Set());

		storageFallaEn = "setItem";
		await expect(
			dismissAnnouncementsLocally([AVISO.id]),
		).resolves.toBeUndefined();
	});

	test("un valor que no es JSON se descarta entero", async () => {
		storage.set(localDismissalKey("user"), "{no es json");

		expect(await fetchDismissedIdsLocally()).toEqual(new Set());
	});

	test("un JSON que no es una lista de ids no inventa descartes", async () => {
		// Confiar en lo que hay en la key convertiría dos números en dos avisos
		// "ya descartados" que no existen, y esos ids no se van a matchear con
		// ningún aviso: el descarte local se vuelve basura que no se limpia.
		storage.set(localDismissalKey("user"), JSON.stringify([1, 2]));

		expect(await fetchDismissedIdsLocally()).toEqual(new Set());
	});

	test("descartar una lista vacía no escribe nada", async () => {
		await dismissAnnouncementsLocally([]);

		expect(storage.size).toBe(0);
	});
});

describe("silenciar un required NO escribe la fila de acknowledgement", () => {
	test("no toca Supabase en absoluto", async () => {
		await dismissRequiredAnnouncementLocally(AVISO.id);

		// Esta es la invariante de toda la función, y no hay forma de derivarla del
		// código: la tabla `announcement_acknowledgements` no tiene policy de UPDATE
		// ni de DELETE, así que una fila escrita acá no se puede corregir nunca. Un
		// obligatorio que nadie leyó quedaría registrado para siempre como
		// entendido, que es un dato falso y además impide que el aviso vuelva.
		expect(llamadas()).toHaveLength(0);
	});

	test("queda en el almacén local, con la clave de los required", async () => {
		await dismissRequiredAnnouncementLocally(AVISO.id);

		// Clave aparte de la del `info`, y por audiencia. Compartirla haría que el
		// `MAX_LOCAL_DISMISSALS` de los informativos —200 con desalojo del más
		// viejo— se cumpliera con silencios deliberados, y el aviso reaparecería
		// solo.
		expect(storage.get(localRequiredDismissalKey("user"))).toBe(
			JSON.stringify([AVISO.id]),
		);
	});

	test("se lee después de escribirlo", async () => {
		await dismissRequiredAnnouncementLocally(AVISO.id);

		// La lista lo muestra como descartado sin pedirle nada a la red: el estado
		// sale del mismo almacén que lo escribió.
		expect(await fetchDismissedRequiredIdsLocally()).toEqual(
			new Set([AVISO.id]),
		);
	});

	test("acumula sobre lo que ya había, sin pisarlo", async () => {
		storage.set(localRequiredDismissalKey("user"), JSON.stringify(["previo"]));
		await dismissRequiredAnnouncementLocally(AVISO.id);

		expect(await fetchDismissedRequiredIdsLocally()).toEqual(
			new Set(["previo", AVISO.id]),
		);
	});

	test("no toca el almacén de los info", async () => {
		storage.set(localDismissalKey("user"), JSON.stringify(["info-previo"]));
		await dismissRequiredAnnouncementLocally(AVISO.id);

		expect(await fetchDismissedIdsLocally()).toEqual(new Set(["info-previo"]));
		expect(await fetchDismissedRequiredIdsLocally()).toEqual(
			new Set([AVISO.id]),
		);
	});
});
