import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { CreateOfferSchema } from "../../catalog/schemas/offer.schema";

/**
 * Por qué esto NO es un `TimestamptzSchema` más estricto.
 *
 * `TimestamptzSchema` es deliberadamente laxo y el AGENTS.md del paquete prohíbe
 * endurecerlo: PostgREST devuelve `+00:00` y `z.iso.datetime()` solo lo acepta con
 * `{ offset: true }`. Endurecerlo rompe 38 archivos de contrato para tapar un caso
 * que no es de lectura.
 *
 * Y el caso no es de lectura. `pickup_start` y `pickup_end` son ENTRADA, y lo que
 * llega por ahí no viene de PostgREST sino de `DateTimePicker`, cuyo
 * `DATE_TIME_FORMAT` es `yyyy-MM-dd'T'HH:mm` — sin offset y sin segundos. Medido:
 * `z.iso.datetime({ offset: true })`, el schema que el repo ya usa para entrada
 * estricta (`business-stats.schema.ts:111`), **rechaza ese valor**.
 *
 * O sea: la tentación de "copiar el patrón de stats" rompe el formulario de
 * publicaciones. Por eso el schema de entrada va con `{ offset: true, local: true }`
 * — acepta el instante que el picker emite y también el `+00:00` de la base — y el
 * defecto que se arregla es otro: que `start_at: "hola"` no llegara al `.refine` de
 * la ventana, donde `NaN >= NaN` es `false` y el mensaje culpa al campo equivocado.
 */
const OfferVálido = {
	business_id: "11111111-2222-4333-8444-555555555555",
	business_location_id: "11111111-2222-4333-8444-666666666666",
	title: "Bagels",
	category_ids: ["11111111-2222-4333-8444-777777777777"],
	original_price: 10,
	discounted_price: 5,
};

describe("la entrada de una ventana de fechas", () => {
	it("acepta el formato que emite DateTimePicker", () => {
		// `DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm"`: sin offset, sin segundos. Es lo
		// que el panel manda de verdad al publicar una oferta, así que un schema que
		// lo rechaza rompe el formulario, no una prueba.
		const r = CreateOfferSchema.safeParse({
			...OfferVálido,
			pickup_start: "2026-10-04T15:30",
			pickup_end: "2026-10-04T19:00",
		});
		expect(r.success).toBe(true);
	});

	it("acepta el ISO con offset que devuelve PostgREST", () => {
		// El otro extremo del rango real: microsegundos y `+00:00`. Si el schema de
		// entrada rechazara esto, un PATCH que revalida una fila ya leída fallaría.
		const r = CreateOfferSchema.safeParse({
			...OfferVálido,
			pickup_start: "2026-05-07T19:58:23.836956+00:00",
			pickup_end: "2026-05-07T21:58:23.836956+00:00",
		});
		expect(r.success).toBe(true);
	});

	it("rechaza una fecha que no es fecha, y lo dice en el campo que la tiene", () => {
		// Antes: `"hola"` pasaba el schema y llegaba al `.refine` de la ventana, que
		// respondía "pickup_end must be after pickup_start". El mensaje culpaba al
		// campo equivocado y mandaba al operador a corregir algo que estaba bien.
		const r = CreateOfferSchema.safeParse({
			...OfferVálido,
			pickup_start: "hola",
			pickup_end: "2026-10-04T19:00",
		});
		expect(r.success).toBe(false);
		if (r.success) throw new Error("la guarda no se ejecutó");
		const rutas = r.error.issues.map((i) => i.path.join("."));
		expect(rutas).toContain("pickup_start");
		// Y el mensaje de la ventana deja de ser la primera respuesta: ahora el
		// problema está donde está.
		expect(r.error.issues[0]?.message).not.toBe(
			"pickup_end must be after pickup_start",
		);
	});

	it("el refine de la ventana sigue siendo el dueño del orden", () => {
		// Endurecer el formato no le roba el trabajo al refine: dos fechas bien
		// formadas pero invertidas las rechaza él, no el formato.
		const r = CreateOfferSchema.safeParse({
			...OfferVálido,
			pickup_start: "2026-10-04T19:00",
			pickup_end: "2026-10-04T15:30",
		});
		expect(r.success).toBe(false);
		if (r.success) throw new Error("la guarda no se ejecutó");
		expect(r.error.issues[0]?.message).toBe(
			"pickup_end must be after pickup_start",
		);
	});

	it("una fecha ISO con offset sigue siendo parseable por el refine", () => {
		// La comparación del refine no puede seguir siendo de strings: "2026-10-04"
		// es una fecha válida que como texto ordena distinto a "2026-10-04T15:30".
		const iso = z.iso.datetime({ offset: true, local: true });
		expect(Date.parse(iso.parse("2026-10-04T15:30"))).toBeLessThan(
			Date.parse(iso.parse("2026-10-04T19:00")),
		);
	});
});
