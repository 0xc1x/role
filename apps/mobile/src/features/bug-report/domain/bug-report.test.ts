import { describe, expect, test } from "bun:test";

import { strings } from "@/src/core/i18n/strings";

import {
	assertReportImageCount,
	detectImageContentType,
	localImageFromBytes,
	MAX_REPORT_DESCRIPTION_CHARS,
	MAX_REPORT_IMAGE_BYTES,
	MAX_REPORT_IMAGES,
	MAX_REPORT_SUMMARY_CHARS,
	normalizeDescription,
	normalizeSummary,
	reportOriginFor,
} from "./bug-report";

/** ArrayBuffer con los primeros bytes fijados. */
function bytesWith(...head: number[]): ArrayBuffer {
	return new Uint8Array(head).buffer as ArrayBuffer;
}

/** ArrayBuffer de `size` bytes que abre con una firma válida. */
function sizedJpeg(size: number): ArrayBuffer {
	const buffer = new ArrayBuffer(size);
	new Uint8Array(buffer).set([0xff, 0xd8, 0xff, 0xe0]);
	return buffer;
}

const JPEG_BYTES = bytesWith(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);

describe("detectImageContentType", () => {
	test("reconoce las tres firmas que el bucket acepta", () => {
		expect(detectImageContentType(JPEG_BYTES)).toBe("image/jpeg");
		expect(detectImageContentType(bytesWith(0x89, 0x50, 0x4e, 0x47))).toBe(
			"image/png",
		);
		expect(
			detectImageContentType(
				bytesWith(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
			),
		).toBe("image/webp");
	});

	test("cualquier otra cosa es null, aunque tenga extensión de imagen", () => {
		// Un PDF empieza igual que un JPEG en algunos exportadores: por eso el
		// sniffing es por magic bytes y no por el nombre.
		expect(
			detectImageContentType(bytesWith(0x25, 0x50, 0x44, 0x46)),
		).toBeNull();
		expect(detectImageContentType(bytesWith(0x00, 0x01, 0x02))).toBeNull();
		// Buffer más corto que la firma más corta: no es un JPEG truncado.
		expect(detectImageContentType(bytesWith(0xff))).toBeNull();
	});
});

describe("el resumen es obligatorio y se recorta", () => {
	test("el recorte es lo que se manda, no el texto crudo del usuario", () => {
		expect(normalizeSummary("  La app crashea al pagar  ")).toBe(
			"La app crashea al pagar",
		);
		expect(normalizeSummary("Falla al reservar\n")).toBe("Falla al reservar");
	});

	test("un resumen que solo tiene espacios es un reporte sin resumen", () => {
		// Sin este corte la fila llegaría al panel y saldría vacía: el operador
		// vería un buzón con filas que no dicen nada.
		for (const blank of ["", "   ", "\n\t "]) {
			expect(() => normalizeSummary(blank)).toThrow();
		}
	});
});

describe("la descripción se recorta pero es opcional", () => {
	test("ausente o en blanco sale en null, no en cadena vacía", () => {
		expect(normalizeDescription(undefined)).toBeNull();
		expect(normalizeDescription("   ")).toBeNull();
	});

	test("con texto se recorta", () => {
		expect(normalizeDescription("  pasa al pulsar reservar ")).toBe(
			"pasa al pulsar reservar",
		);
	});
});

/**
 * Topes de ESCRITURA del texto.
 *
 * No es legibilidad: `app_store.value` es un `jsonb` sin restricción de tamaño
 * y el `WITH CHECK` de la única policy de insert no mira `value`, así que el
 * cliente elige el tamaño. El resumen se copia verbatim a la columna del
 * listado, y un cliente que mande 5 MB produce 5 MB por fila × 20 filas. El
 * buzón deja de responder.
 *
 * Y NO es truncar en lectura, que es lo que commonsaretteó no hacer: acá el
 * texto se RECHAZA con un mensaje accionable en vez de perderse en silencio.
 */
describe("el texto del usuario tiene tope de escritura", () => {
	test("los topes son los que el dominio declara", () => {
		expect(MAX_REPORT_SUMMARY_CHARS).toBe(300);
		expect(MAX_REPORT_DESCRIPTION_CHARS).toBe(4_000);
	});

	test("un resumen de más se rechaza, con el número en el mensaje", () => {
		// El `{max}` lo resuelve el dominio: sin eso el usuario leería "{max}" en
		// crudo y el rechazo deja de ser accionable.
		let caught: unknown;
		try {
			normalizeSummary("A".repeat(MAX_REPORT_SUMMARY_CHARS + 1));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as { kind?: string }).kind).toBe("validation");
		const mensaje = (caught as Error).message;
		expect(mensaje).toContain(String(MAX_REPORT_SUMMARY_CHARS));
		expect(mensaje).not.toContain("{max}");
	});

	test("justo en el tope entra", () => {
		// El límite es "> tope", no ">= tope": un texto de exactamente 300
		// caracteres es un resumen legítimo y rechazarlo sería un tope de 299
		// disfrazado.
		expect(normalizeSummary("A".repeat(MAX_REPORT_SUMMARY_CHARS))).toBe(
			"A".repeat(MAX_REPORT_SUMMARY_CHARS),
		);
	});

	test("una descripción de más se rechaza, con el número en el mensaje", () => {
		let caught: unknown;
		try {
			normalizeDescription("B".repeat(MAX_REPORT_DESCRIPTION_CHARS + 1));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		const mensaje = (caught as Error).message;
		expect(mensaje).toContain(String(MAX_REPORT_DESCRIPTION_CHARS));
		expect(mensaje).not.toContain("{max}");
	});

	test("la vacuidad se comprueba ANTES que el largo", () => {
		// Un resumen de 5 MB de espacios no es "demasiado largo": es un resumen
		// vacío. Con el orden invertido el usuario recibe "es muy largo" y su
		// reacción —borrarlo— lo deja igual, en un bucle.
		let caught: unknown;
		try {
			normalizeSummary(" ".repeat(MAX_REPORT_SUMMARY_CHARS + 1));
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).message).toBe(
			strings.bugReport.errorSummaryRequired,
		);
	});

	test("una descripción de 10.000 espacios NO es un rechazo de tamaño", () => {
		// El largo se mide sobre el texto YA recortado, no sobre el crudo: un
		// campo de 10.000 espacios se normaliza a `null` y no se escribe, así que
		// rechazarlo sería un falso positivo sobre un reporte que sí era válido.
		expect(normalizeDescription(" ".repeat(10_000))).toBeNull();
	});

	test("el rechazo de capturas también resuelve su {max}", () => {
		// `errorTooManyImages` llevaba el 5 escrito a mano y su comentario
		// señalaba la corrección de fondo como pendiente. Ahora el número sale de
		// `MAX_REPORT_IMAGES`, que es donde vive el valor.
		let caught: unknown;
		try {
			assertReportImageCount(MAX_REPORT_IMAGES + 1);
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).message).toContain(String(MAX_REPORT_IMAGES));
		expect((caught as Error).message).not.toContain("{max}");
	});
});

describe("una imagen sin MIME reconocible se rechaza antes de subir", () => {
	test("los bytes que no son imagen no llegan a ser LocalImage", () => {
		expect(() =>
			localImageFromBytes(bytesWith(0x25, 0x50, 0x44, 0x46)),
		).toThrow();
	});

	test("el rechazo es de validación y explica el motivo en el copy", () => {
		// `business/data/repository.ts` sube estas mismas bytes y deja que Storage
		// las rechace: acá el usuario ya escribió el texto y no puede perder la
		// pantalla por un archivo que no era una imagen.
		let caught: unknown;
		try {
			localImageFromBytes(bytesWith(0x00, 0x01, 0x02, 0x03));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as { kind?: string }).kind).toBe("validation");
		expect((caught as Error).message).toMatch(/imagen/i);
	});
});

describe("una imagen sobre el límite se rechaza en cliente", () => {
	test("el límite es el del bucket: 5 MB por archivo", () => {
		expect(MAX_REPORT_IMAGE_BYTES).toBe(5_242_880);
	});

	test("un byte de más se rechaza sin tocar la red", () => {
		expect(() =>
			localImageFromBytes(sizedJpeg(MAX_REPORT_IMAGE_BYTES + 1)),
		).toThrow();
	});

	test("exactamente en el límite pasa", () => {
		const image = localImageFromBytes(sizedJpeg(MAX_REPORT_IMAGE_BYTES));
		expect(image.contentType).toBe("image/jpeg");
		expect(image.bytes.byteLength).toBe(MAX_REPORT_IMAGE_BYTES);
	});
});

describe("el origen sale de la plataforma, no del usuario", () => {
	test("nativo se nombra a sí mismo", () => {
		expect(reportOriginFor("ios")).toBe("ios");
		expect(reportOriginFor("android")).toBe("android");
	});

	test("la web y el PWA son el MISMO canal: pwa", () => {
		// `web` NO es un valor aceptable: la policy de insert solo admite
		// ('ios','android','pwa'), así que escribir 'web' haría fallar TODA la
		// inserción con una violación de policy en vez de un error legible.
		expect(reportOriginFor("web")).toBe("pwa");
	});

	test("un origin fuera de la policy nunca se produce", () => {
		for (const os of ["macos", "windows", "web", "", "IOS"]) {
			expect(["ios", "android", "pwa"]).toContain(reportOriginFor(os));
		}
	});
});
