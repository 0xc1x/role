import { describe, expect, test } from "bun:test";
import { ApiClientError } from "@/lib/api/errors";
import { BULK_CONCURRENCY, runBulkAction } from "../bulk-action";

describe("runBulkAction", () => {
	test("no lanza cuando una fila falla: el fallo es un resultado, no una excepción", async () => {
		const outcome = await runBulkAction(["a", "b", "c"], async (item) => {
			if (item === "b") throw new Error("boom");
		});

		expect(outcome.succeeded).toEqual(["a", "c"]);
		expect(outcome.failed.map((f) => f.item)).toEqual(["b"]);
		expect(outcome.skipped).toEqual([]);
	});

	// El `requestId` es lo único que cruza el toast del operador con el log del
	// servidor. Si el recibo del lote lo pierde, un fallo parcial deja de ser
	// accionable por soporte.
	test("extrae el requestId de cada fallo de la API", async () => {
		const outcome = await runBulkAction(["a", "b"], async (item) => {
			if (item === "a") {
				throw new ApiClientError({
					status: 409,
					message: "El negocio ya fue verificado",
					requestId: "req_abc12345",
				});
			}
			throw new Error("fallo local sin correlación");
		});

		expect(outcome.failed[0]?.requestId).toBe("req_abc12345");
		expect(outcome.failed[1]?.requestId).toBeUndefined();
	});

	test("respeta el orden en que el operador ve las filas", async () => {
		const outcome = await runBulkAction(
			["a", "b", "c", "d", "e"],
			async (item) => {
				// "a" tarda más que el resto: el orden del resultado no puede
				// depender de quién terminó primero.
				if (item === "a") await Bun.sleep(10);
			},
			{ concurrency: 5 },
		);

		expect(outcome.succeeded).toEqual(["a", "b", "c", "d", "e"]);
	});

	// 12 escrituras simultáneas de un solo click es una forma de pedirle a la
	// API que se caiga: el pool es la garantía, no una optimización.
	test("nunca supera la concurrencia pedida", async () => {
		let inFlight = 0;
		let peak = 0;
		const items = Array.from({ length: 12 }, (_, i) => i);

		await runBulkAction(
			items,
			async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await Bun.sleep(1);
				inFlight--;
			},
			{ concurrency: 3 },
		);

		expect(peak).toBe(3);
		expect(items).toHaveLength(12);
	});

	test("el tope por defecto está acotado", async () => {
		let peak = 0;
		let inFlight = 0;
		await runBulkAction(
			Array.from({ length: BULK_CONCURRENCY * 3 }, (_, i) => i),
			async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await Bun.sleep(1);
				inFlight--;
			},
		);

		expect(peak).toBeLessThanOrEqual(BULK_CONCURRENCY);
	});

	// Sin señal de aborto, un `finally` del componente paints sobre una pantalla
	// en la que el operador ya no está.
	test("abortar deja de despachar y reporta las filas no intentadas como omitidas", async () => {
		const controller = new AbortController();
		const started: number[] = [];

		const outcome = await runBulkAction(
			[0, 1, 2, 3, 4, 5],
			async (item) => {
				started.push(item);
				// La señal se levanta cuando el segundo worker ya tomó su fila:
				// las cuatro restantes nunca entran al pool.
				if (started.length === 2) controller.abort();
				await Bun.sleep(1);
			},
			{ concurrency: 2, signal: controller.signal },
		);

		expect(started).toEqual([0, 1]);
		expect(outcome.succeeded).toEqual([0, 1]);
		expect(outcome.skipped).toEqual([2, 3, 4, 5]);
		expect(outcome.failed).toEqual([]);
	});

	test("una señal ya levantada no despacha ninguna fila", async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;

		const outcome = await runBulkAction(
			[0, 1, 2],
			async () => {
				calls++;
			},
			{ concurrency: 2, signal: controller.signal },
		);

		expect(calls).toBe(0);
		expect(outcome.skipped).toEqual([0, 1, 2]);
	});

	test("sin items devuelve un lote vacío sin tocar el worker", async () => {
		let calls = 0;
		const outcome = await runBulkAction([], async () => {
			calls++;
		});

		expect(calls).toBe(0);
		expect(outcome).toEqual({ succeeded: [], failed: [], skipped: [] });
	});

	// Lotes de tamaño fijo (un `Promise.all` por tanda) congelan a las filas
	// rápidas detrás de la lenta de la misma tanda. El pool con índice
	// compartido no: el hueco que deja la lenta lo ocupa la siguiente.
	test("una fila lenta no congela a las demás del lote", async () => {
		const finished: number[] = [];

		await runBulkAction(
			[0, 1, 2, 3, 4],
			async (item) => {
				await Bun.sleep(item === 0 ? 40 : 1);
				finished.push(item);
			},
			{ concurrency: 2 },
		);

		// Con 2 workers, las filas 1..4 no pueden esperar a la 0: para que las
		// cuatro terminen antes, el segundo worker tuvo que reutilizar su hueco.
		expect(finished.indexOf(4)).toBeLessThan(finished.indexOf(0));
	});
});
