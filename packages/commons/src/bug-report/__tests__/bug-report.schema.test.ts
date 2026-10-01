import { describe, expect, it } from "bun:test";
import {
	BugReportDetailSchema,
	BugReportListItemSchema,
	BugReportValueSchema,
	ListBugReportsQuerySchema,
	SetBugReportStateSchema,
} from "../schemas/bug-report.schema";

/**
 * El `value` de un reporte de error es `jsonb` sin tipo, y su escritura no pasa
 * por la API: la hace el móvil contra Supabase directo (D6). Este schema es lo
 * único que separa "una fila rara" de "toda la bandeja caída", así que los
 * casos que importan son los que NO deben romperse —incluida toda fila recién
 * insertada, a la que un trigger le agrega `reporter_id` después de que el
 * cliente escribiera lo suyo— y el que sí debe marcar la fila como ilegible.
 */

const valorValido = {
	summary: "La app se cierra al abrir el carrito",
	description: "Abre el carrito y la app se cierra sola. Passé tres veces.",
	images: [
		"6b1c1f2e-0000-4000-8000-000000000001/a1b2.webp",
		"6b1c1f2e-0000-4000-8000-000000000001/c3d4.webp",
	],
	reporter_id: "6b1c1f2e-0000-4000-8000-000000000001",
	at: "2026-09-30T18:45:00.000Z",
};

describe("BugReportValueSchema", () => {
	it("parsea el value que escribe el cliente desde el móvil", () => {
		const parsed = BugReportValueSchema.parse(valorValido);
		expect(parsed.summary).toBe("La app se cierra al abrir el carrito");
		expect(parsed.images).toHaveLength(2);
		expect(parsed.reporter_id).toBe("6b1c1f2e-0000-4000-8000-000000000001");
	});

	it("tolera el value mínimo de un reporte sin descripción ni capturas", () => {
		// El sheet acepta reportar solo con el resumen: si el bucket no está
		// configurado en un entorno, el reporte se crea sin imágenes y el flujo
		// de texto no puede depender de eso.
		const parsed = BugReportValueSchema.parse({ summary: "Se ve gris" });
		expect(parsed.summary).toBe("Se ve gris");
		expect(parsed.description).toBeUndefined();
		expect(parsed.images).toBeUndefined();
	});

	it("un value sin summary no es un reporte", () => {
		// `summary` es el ANCLA, el mismo criterio con el que
		// `ContactMessageValueSchema` exige email/role/city: son los campos que
		// identifican la fila. Sin ellos, cualquier objeto guardado bajo el
		// namespace `bug_report` pasaba el parseo y salía en el panel como una
		// fila "legible" con todo en null — indistinguible de un reporte
		// realmente vacío, que es justo lo que el flag `readable` evita.
		for (const sinAncla of [
			{ description: "Sin resumen", images: [] },
			{ images: ["a.webp"], at: "2026-09-30T18:45:00.000Z" },
			{ basura: true },
			{ summary: null },
			{ summary: 42 },
			{ summary: ["no es texto"] },
		]) {
			expect(BugReportValueSchema.safeParse(sinAncla).success).toBe(false);
		}
	});

	it("una fila con clave desconocida sigue siendo legible: el schema no es strict", () => {
		// El trigger `stamp_bug_reporter` sella `value.reporter_id` con
		// `auth.uid()` en un BEFORE INSERT, y `app_store` es un store genérico
		// que mañana puede llevar las claves que quiera. Si este objeto fuera
		// `strict`, toda fila recién insertada sería ilegible: se listaría con
		// `readable: false` y el operador no vería ni el resumen que el usuario
		// acaba de escribir. Zod descarta lo que no conoce en vez de fallar.
		const parsed = BugReportValueSchema.parse({
			summary: "Falla al pagar",
			device_model: "iPhone 13",
			app_version: "3.2.0",
		});
		expect(parsed.summary).toBe("Falla al pagar");
		expect("app_version" in parsed).toBe(false);
	});

	it("rechaza un value con un tipo incorrecto", () => {
		expect(
			BugReportValueSchema.safeParse({
				summary: "ok",
				images: "no-es-un-array",
			}).success,
		).toBe(false);
		expect(
			BugReportValueSchema.safeParse({ ...valorValido, reporter_id: 7 })
				.success,
		).toBe(false);
		expect(BugReportValueSchema.safeParse("no soy un objeto").success).toBe(
			false,
		);
		expect(BugReportValueSchema.safeParse(null).success).toBe(false);
	});

	it("acepta un resumen más largo que cualquier límite de escritura", () => {
		// El límite de longitud, si algún día existe, es regla de escritura. Una
		// fila vieja que lo exceda no puede perder el texto que el usuario sí
		// puede leer porque se pasó de largo.
		const largo = "a".repeat(20_000);
		expect(
			BugReportValueSchema.safeParse({ ...valorValido, summary: largo })
				.success,
		).toBe(true);
	});
});

describe("el listado y el detalle del buzón", () => {
	const fila = {
		id: "11111111-1111-4111-8111-111111111111",
		state: "ABIERTO",
		delivery_status: "PENDIENTE",
		origin: "ios",
		created_at: "2026-09-30T18:45:00.000Z",
		updated_at: "2026-09-30T18:45:00.000Z",
		readable: true,
		summary: "La app se cierra al abrir el carrito",
		excerpt: "Abre el carrito y la app se cierra sola.",
	};

	it("trae los tres ejes: entrega, triaje y origen", () => {
		const parsed = BugReportListItemSchema.parse(fila);
		expect(parsed.state).toBe("ABIERTO");
		expect(parsed.delivery_status).toBe("PENDIENTE");
		expect(parsed.origin).toBe("ios");
	});

	it("state y origin son nullish: el contacto no usa esos ejes", () => {
		// `state` y `origin` son columnas genéricas de `app_store`: el mensaje de
		// contacto lleva `state` en NULL siempre y su origen es `web`. Compartir
		// tabla no significa compartir vocabulario, y el DTO del buzón de
		// reportes no puede exigir lo que la tabla deja opcional.
		const parsed = BugReportListItemSchema.parse({
			...fila,
			state: null,
			origin: null,
		});
		expect(parsed.state).toBeNull();
		expect(parsed.origin).toBeNull();
	});

	it("rechaza un state que no existe en el vocabulario", () => {
		expect(
			BugReportListItemSchema.safeParse({ ...fila, state: "REABIERTO" })
				.success,
		).toBe(false);
		expect(
			BugReportListItemSchema.safeParse({ ...fila, origin: "telegram" })
				.success,
		).toBe(false);
	});

	it("una fila ilegible se representa sin lanzar", () => {
		// Mismo criterio que la bandeja de contactos: se lista igual, vacía, en
		// vez de romper la respuesta. Una sola fila con `value` corrupto no puede
		// tumbar el buzón de reportes.
		const ilegible = BugReportListItemSchema.parse({
			id: "11111111-1111-4111-8111-111111111111",
			state: "EN_REPRODUCCION",
			delivery_status: "PROCESADO",
			origin: "android",
			created_at: "2026-09-30T18:45:00.000Z",
			updated_at: "2026-09-30T18:45:00.000Z",
			readable: false,
			summary: null,
			excerpt: null,
		});
		expect(ilegible.readable).toBe(false);
		expect(ilegible.summary).toBeNull();
	});

	it("el listado NO publica reporter_id ni las rutas de las capturas", () => {
		// `reporter_id` es dato personal y las rutas apuntan a un bucket privado:
		// el listado es la pantalla que se puede ampliar en un monitor de
		// soporte. Los DTO no repiten claves que el mapper no nombra.
		const claves = Object.keys(BugReportListItemSchema.shape).sort();
		expect(claves).toEqual([
			"created_at",
			"delivery_status",
			"excerpt",
			"id",
			"origin",
			"readable",
			"state",
			"summary",
			"updated_at",
		]);
	});

	it("el detalle agrega cuerpo, capturas y autor, ya con null en vez de undefined", () => {
		const claves = Object.keys(BugReportDetailSchema.shape);
		expect(claves).toContain("description");
		expect(claves).toContain("images");
		expect(claves).toContain("reporter_id");
		expect(claves).toContain("received_at");

		// El mapper de la API trabaja con filas ya parseadas: ausente y vacío
		// tienen que ser la misma respuesta para el panel, o el drawer muestra
		// "undefined" donde no hay descripción.
		const detalle = BugReportDetailSchema.parse({
			...fila,
			description: null,
			images: [],
			reporter_id: null,
			received_at: null,
		});
		expect(detalle.description).toBeNull();
		expect(detalle.images).toEqual([]);
		expect(detalle.reporter_id).toBeNull();
	});
});

function cladasSeguras(claves: string[]): string[] {
	return claves;
}

describe("SetBugReportStateSchema", () => {
	it("acepta los cinco estados del ciclo de vida", () => {
		for (const state of [
			"ABIERTO",
			"EN_REPRODUCCION",
			"CORREGIDO",
			"DUPLICADO",
			"DESCARTADO",
		] as const) {
			expect(SetBugReportStateSchema.parse({ state }).state).toBe(state);
		}
	});

	it("un state desconocido se rechaza", () => {
		// `state` es `text` en Postgres a propósito (D4: un enum obliga a migrar
		// cada vez que aparece un namespace nuevo). Ese margen lo cierra ESTE
		// schema, que es el vocabulario: el panel no puede escribir un estado que
		// el contrato no conoce.
		for (const state of ["REABIERTO", "abierto", "", null, undefined, 3]) {
			expect(SetBugReportStateSchema.safeParse({ state }).success).toBe(false);
		}
	});

	it("exige el state: no hay triaje parcial", () => {
		expect(SetBugReportStateSchema.safeParse({}).success).toBe(false);
	});

	it("descarta claves que el cliente se invente", () => {
		// El PATCH de triaje no lleva `delivery_status`: la entrega la mueve el
		// camino de la API cuando el aviso se entrega, no el operador. Que la
		// clave no se colapse en el body es lo que impide que el panel la use
		// por error para fingir una entrega.
		const parsed = SetBugReportStateSchema.parse({
			state: "CORREGIDO",
			delivery_status: "PROCESADO",
			readable: true,
		});
		expect(parsed).toEqual({ state: "CORREGIDO" });
	});
});

describe("ListBugReportsQuerySchema", () => {
	it("aplica paginación por defecto", () => {
		expect(ListBugReportsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
	});

	it("filtra por state y por origin", () => {
		const parsed = ListBugReportsQuerySchema.parse({
			state: "DUPLICADO",
			origin: "android",
		});
		expect(parsed.state).toBe("DUPLICADO");
		expect(parsed.origin).toBe("android");
	});

	it("rechaza un filtro fuera del vocabulario", () => {
		expect(
			ListBugReportsQuerySchema.safeParse({ state: "PENDIENTE" }).success,
		).toBe(false);
		expect(
			ListBugReportsQuerySchema.safeParse({ origin: "desktop" }).success,
		).toBe(false);
	});

	it("descarta un namespace del cliente en vez de obedecerlo", () => {
		// El endpoint está amarrado al namespace `bug_report` en el servidor y no
		// hay forma de que el cliente pida la bandeja de contactos por este lado.
		const parsed = ListBugReportsQuerySchema.parse({ namespace: "contact" });
		expect("namespace" in parsed).toBe(false);
	});
});
