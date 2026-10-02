import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

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

// `File` de expo-file-system sólo existe en runtime nativo; en el test se
// reemplaza por un doble que devuelve los bytes que el caso le pida.
let fileBytes: ArrayBuffer = new ArrayBuffer(0);
mock.module("react-native", () => ({ Platform: { OS: "ios" } }));
mock.module("expo-file-system", () => ({
	// El `File` real recibe la URI en el constructor; el doble no la usa porque
	// los bytes salen de `fileBytes`, que cada caso fija explícitamente.
	File: class {
		// biome-ignore lint/complexity/noUselessConstructor: espeja la firma de File
		constructor(_uri?: string) {}
		arrayBuffer() {
			return Promise.resolve(fileBytes);
		}
	},
}));
mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		storage: { from: jest.fn() },
		auth: { getUser: jest.fn() },
	},
}));

// El mock debe registrarse antes de cargar el repositorio.
const { supabase } = await import("@/src/core/supabase/client");
const { submitBugReport } = await import(
	"@/src/features/bug-report/data/repository"
);
const { MAX_REPORT_IMAGE_BYTES, MAX_REPORT_IMAGES, REPORT_BUCKET } =
	await import("@/src/features/bug-report/domain/bug-report");

const USER_ID = "user-abc-123";
const fromMock = supabase.from as unknown as jest.Mock;
const storageFromMock = (supabase.storage as { from: unknown })
	.from as jest.Mock;
const getUserMock = supabase.auth.getUser as unknown as jest.Mock;

/**
 * Traza de llamadas en orden de aparición, para poder afirmar sobre el ORDEN
 * entre el bucket y el insert. Es la razón de ser del primer test: subir
 * después de insertar deja filas apuntando a capturas que todavía no existen.
 */
let calls: string[] = [];
let insertRow: Record<string, unknown> | null = null;
let insertError: unknown = null;
let uploadError: unknown = null;

function setup(options?: { images?: ArrayBuffer[]; user?: string | null }) {
	calls = [];
	insertRow = null;
	insertError = null;
	uploadError = null;
	const queue = [...(options?.images ?? [])];
	fileBytes = queue.shift() ?? new ArrayBuffer(0);

	// Sin esto los contadores de llamadas arrastran los casos anteriores y un
	// `not.toHaveBeenCalled()` pasa por lo que hizo el test previo, no por lo
	// que hizo éste: un test que no puede fallar.
	fromMock.mockClear();
	storageFromMock.mockClear();
	getUserMock.mockClear();

	getUserMock.mockImplementation(async () => ({
		data: {
			user: options?.user === null ? null : { id: options?.user ?? USER_ID },
		},
		error: null,
	}));

	fromMock.mockImplementation((table: string) => {
		calls.push(`from:${table}`);
		return {
			insert: (row: Record<string, unknown>) => {
				calls.push("insert");
				insertRow = row;
				return Promise.resolve({ data: null, error: insertError });
			},
		};
	});

	storageFromMock.mockImplementation((bucket: string) => {
		calls.push(`storage.from:${bucket}`);
		return {
			// El `bytes` que se sube no se mira en estos tests: lo que se afirma
			// es el path, el orden y que el insert lleva rutas y no URLs.
			upload: (path: string, _bytes: ArrayBuffer, _opts: unknown) => {
				calls.push(`upload:${path}`);
				return Promise.resolve({ error: uploadError });
			},
		};
	});
}

/** Bytes que abren con firma JPEG y miden `size`. */
function jpeg(size: number): ArrayBuffer {
	const buffer = new ArrayBuffer(size);
	new Uint8Array(buffer).set([0xff, 0xd8, 0xff, 0xe0]);
	return buffer;
}

const BASE_INPUT = { summary: "La app crashea al pagar", images: [] };

beforeEach(() => setup());

describe("sube las imágenes antes de insertar la fila", () => {
	test("el bucket va antes del insert, y en el bucket correcto", async () => {
		setup({ images: [jpeg(64)] });

		await submitBugReport({
			summary: "La app crashea al pagar",
			images: [
				{
					bytes: jpeg(64),
					contentType: "image/jpeg",
				},
			],
		});

		const uploadIndex = calls.findIndex((c) => c.startsWith("upload:"));
		const insertIndex = calls.indexOf("insert");
		expect(uploadIndex).toBeGreaterThanOrEqual(0);
		expect(insertIndex).toBeGreaterThan(uploadIndex);
		expect(calls).toContain(`storage.from:${REPORT_BUCKET}`);
		// `value.images` guarda RUTAS del bucket, no URLs ni bytes: el bucket es
		// privado y descargar es lo que hace el API firmando una URL.
		const row = insertRow as { value: { images: string[] } };
		expect(row.value.images[0]).toMatch(/^user-abc-123\/report\//);
	});
});

describe("el path queda scopeado al uid del usuario", () => {
	test("la policy de storage exige que el primer folder sea el uid", async () => {
		setup({ images: [jpeg(64)] });

		await submitBugReport({
			summary: "Falla al reservar",
			images: [{ bytes: jpeg(64), contentType: "image/jpeg" }],
		});

		const uploaded = calls.find((c) => c.startsWith("upload:"));
		expect(uploaded).toBeDefined();
		expect(uploaded?.startsWith(`upload:${USER_ID}/report/`)).toBe(true);
	});

	test("la extensión del objeto sale del MIME verificado", async () => {
		setup({ images: [jpeg(64)] });

		await submitBugReport({
			summary: "Falla al reservar",
			images: [{ bytes: jpeg(64), contentType: "image/jpeg" }],
		});

		expect(calls.some((c) => c.endsWith(".jpg"))).toBe(true);
	});
});

describe("reporter_id no viaja en el insert: lo sella el trigger", () => {
	test("el value insertado no lo nombra en ninguna forma", async () => {
		setup();

		await submitBugReport(BASE_INPUT);

		const row = insertRow as {
			namespace: string;
			delivery_status: string;
			state: string;
			origin: string;
			value: Record<string, unknown>;
		};
		// Ni en la columna ni dentro del jsonb: mandarlo no rompería nada —el
		// trigger lo sobreescribe en su BEFORE INSERT— pero haría creer que es
		// INPUT del cliente, que es justo lo que el trigger previene.
		expect(Object.keys(row)).not.toContain("reporter_id");
		expect(Object.keys(row.value)).not.toContain("reporter_id");
		expect(JSON.stringify(row)).not.toContain("reporter_id");
	});

	test("lo que sí viaja es lo que la policy exige, en namespace y ejes", async () => {
		setup();

		await submitBugReport(BASE_INPUT);

		const row = insertRow as Record<string, unknown>;
		expect(row.namespace).toBe("bug_report");
		expect(row.delivery_status).toBe("PENDIENTE");
		expect(row.state).toBe("ABIERTO");
		// `origin` y `state` no tienen default en la base: omitirlos haría que la
		// policy los viera en NULL y fallara la inserción entera.
		expect(row.origin).toBe("ios");
	});

	test("el namespace no viene de la entrada del usuario", async () => {
		setup();

		await submitBugReport({
			summary: "Intento escribir en el buzón de contactos",
			// `@ts-expect-error` — el tipo no lo permite; el runtime tampoco debe.
			namespace: "contact",
			images: [],
		} as never);

		expect((insertRow as { namespace: string }).namespace).toBe("bug_report");
	});
});

describe("un reporte sin imágenes no toca el bucket", () => {
	test("no hay llamada a storage cuando no hay capturas", async () => {
		setup();

		await submitBugReport(BASE_INPUT);

		expect(storageFromMock).not.toHaveBeenCalled();
		expect(calls.some((c) => c.startsWith("storage.from:"))).toBe(false);
		const row = insertRow as { value: { images: string[] } };
		expect(row.value.images).toEqual([]);
	});

	test("el texto llega recortado al value", async () => {
		setup();

		await submitBugReport({
			summary: "  La app crashea al pagar  ",
			description: "  pasa al pulsar reservar ",
			images: [],
		});

		const row = insertRow as { value: Record<string, string> };
		expect(row.value.summary).toBe("La app crashea al pagar");
		expect(row.value.description).toBe("pasa al pulsar reservar");
		// `at` es el momento exacto de la escritura; el listado lo usa aparte de
		// `created_at`, que es cuando la fila entró.
		expect(typeof row.value.at).toBe("string");
	});
});

describe("si el insert falla, propaga y no se traga el error", () => {
	test("el error del driver llega al llamador, tipado", async () => {
		setup();
		insertError = {
			code: "42501",
			message: "new row violates row-level security policy",
			details: null,
			hint: null,
		};

		await expect(submitBugReport(BASE_INPUT)).rejects.toThrow();

		let caught: { kind?: string; message?: string } = {};
		try {
			await submitBugReport(BASE_INPUT);
		} catch (error) {
			caught = error as { kind?: string; message?: string };
		}
		// Tragar el error acá dejaría al usuario con un "gracias, enviado" sobre
		// un reporte que no existe.
		expect(caught.kind).toBe("forbidden");
		// El mensaje del driver es inglés y filtra nombres de política: viaja en
		// `context`, nunca al texto que ve la persona.
		expect(caught.message).not.toContain("row-level security");
		expect(caught.message?.length).toBeGreaterThan(0);
	});

	test("un fallo de upload tampoco se traga, y no se inserta la fila", async () => {
		setup({ images: [jpeg(64)] });
		uploadError = { message: "boom", code: "500" };

		await expect(
			submitBugReport({
				summary: "Falla al reservar",
				images: [{ bytes: jpeg(64), contentType: "image/jpeg" }],
			}),
		).rejects.toThrow();
		// Insertar la fila sin las capturas produciría un reporte sin evidencia:
		// el operador vería el texto y ninguna imagen.
		expect(calls).not.toContain("insert");
	});
});

describe("el tope de capturas se aplica al ESCRIBIR, no sólo al leer", () => {
	test("el límite es el mismo número que el .max(5) de lectura", async () => {
		// Si estos dos números se separan, el cliente acepta una fila que el
		// schema de lectura va a marcar `readable: false`, y lo que se pierde es
		// el texto del reporte. Mismo número, dos capas.
		expect(MAX_REPORT_IMAGES).toBe(5);
	});

	test("seis capturas se rechazan ANTES de subir ninguna", async () => {
		setup();

		await expect(
			submitBugReport({
				summary: "Falla al reservar",
				images: Array.from({ length: 6 }, () => ({
					bytes: jpeg(64),
					contentType: "image/jpeg" as const,
				})),
			}),
		).rejects.toThrow();

		// Lo que hace el daño: subir las 5 primeras y recién ahí fallar deja
		// objetos huérfanos en el bucket Y la fila sin escribir.
		expect(storageFromMock).not.toHaveBeenCalled();
		expect(fromMock).not.toHaveBeenCalled();
	});

	test("el rechazo es de validación y dice cuántas caben", async () => {
		setup();

		let caught: { kind?: string; message?: string } = {};
		try {
			await submitBugReport({
				summary: "Falla al reservar",
				images: Array.from({ length: 6 }, () => ({
					bytes: jpeg(64),
					contentType: "image/jpeg" as const,
				})),
			});
		} catch (error) {
			caught = error as { kind?: string; message?: string };
		}
		expect(caught.kind).toBe("validation");
		// Un "algo salió mal" genérico deja al usuario sin forma de saber que
		// el problema es la cantidad de capturas.
		expect(caught.message).toMatch(/5/);
	});

	test("cinco capturas sí pasan y las cinco suben", async () => {
		setup();

		await submitBugReport({
			summary: "Falla al reservar",
			images: Array.from({ length: 5 }, () => ({
				bytes: jpeg(64),
				contentType: "image/jpeg" as const,
			})),
		});

		expect(calls.filter((c) => c.startsWith("upload:"))).toHaveLength(5);
		const row = insertRow as { value: { images: string[] } };
		expect(row.value.images).toHaveLength(5);
	});
});

describe("el id de captura no depende de que crypto exista", () => {
	test("sin crypto.randomUUID igual se arma un path y se sube", async () => {
		// Hermes no garantiza `globalThis.crypto`. `orders/data/repository.ts`
		// accede directo y trunca; acá se usa la forma segura de
		// `profile/data/repository.ts`.
		const original = globalThis.crypto;
		try {
			Object.defineProperty(globalThis, "crypto", {
				value: undefined,
				configurable: true,
			});
			setup();

			await submitBugReport({
				summary: "Falla al reservar",
				images: [{ bytes: jpeg(64), contentType: "image/jpeg" }],
			});

			const uploaded = calls.find((c) => c.startsWith("upload:"));
			expect(uploaded?.startsWith(`upload:${USER_ID}/report/`)).toBe(true);
			expect(uploaded?.endsWith(".jpg")).toBe(true);
		} finally {
			Object.defineProperty(globalThis, "crypto", {
				value: original,
				configurable: true,
			});
		}
	});
});

describe("sin sesión no se intenta escribir", () => {
	test("el uid del path viene de la sesión, y sin sesión no hay path", async () => {
		setup({ user: null });

		await expect(
			submitBugReport({
				summary: "Falla al reservar",
				images: [{ bytes: jpeg(64), contentType: "image/jpeg" }],
			}),
		).rejects.toThrow();

		expect(storageFromMock).not.toHaveBeenCalled();
		expect(fromMock).not.toHaveBeenCalled();
	});
});

describe("valida antes de gastar red", () => {
	test("una imagen sobre el límite se rechaza sin tocar Storage ni el insert", async () => {
		setup();

		await expect(
			submitBugReport({
				summary: "Falla al reservar",
				images: [
					{
						bytes: jpeg(MAX_REPORT_IMAGE_BYTES + 1),
						contentType: "image/jpeg",
					},
				],
			}),
		).rejects.toThrow();

		expect(storageFromMock).not.toHaveBeenCalled();
		expect(fromMock).not.toHaveBeenCalled();
	});
});
