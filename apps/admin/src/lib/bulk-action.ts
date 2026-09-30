/**
 * Lanza la misma acción sobre varias filas y devuelve el RECIBO de lo que pasó.
 *
 * POR QUÉ EXISTE: una acción en lote sobre 12 filas son 12 peticiones, y cada
 * una puede tener un desenlace distinto. La UI necesita poder responder tres
 * preguntas que un único `await` no contesta: cuántas salieron bien, cuáles
 * fallaron y con qué `requestId` las localizó el servidor. Devolver solo
 * `Promise.all` obliga a la UI a decidir entre tragarse el error (y mentir con
 * un "listo") o perder el detalle de las que sí salieron.
 *
 * La concurrencia es ACOTADA a propósito: la API es una BFF con reglas de
 * negocio (verificación, correo transaccional) y 12 escrituras simultáneas de un
 * solo click son una forma de pedirle que se caiga. El tope sigue la misma
 * lógica que `fetchAllPages` para las lecturas.
 */

import { ApiClientError } from "./api/errors";

/**
 * Mutaciones simultáneas. Menor que el tope de `fetchAllPages` porque cada
 * escritura dispara correo transaccional y notifications, no solo un `SELECT`.
 */
export const BULK_CONCURRENCY = 4;

export interface BulkFailure<TItem> {
	item: TItem;
	/** El throw original: la UI lo formatea con `formatApiError`. */
	error: unknown;
	/**
	 * `ApiClientError.requestId` cuando la API dio correlación. Se expone
	 * aparte del mensaje para que la superficie de fallo pueda distinguir
	 * "falló sin correlación" (fallo local) de "falló en el servidor".
	 */
	requestId?: string;
}

export interface BulkOutcome<TItem> {
	succeeded: TItem[];
	failed: BulkFailure<TItem>[];
	/** Filas que ni siquiera se intentaron: la señal de aborto estaba levantada. */
	skipped: TItem[];
}

/**
 * Ejecuta `worker` sobre `items` con un pool acotado y NUNCA lanza: un fallo por
 * fila es un resultado, no una excepción del lote. El orden de `succeeded` y
 * `failed` sigue el de `items`, que es el orden en que el operador los ve en
 * pantalla.
 *
 * `signal` no cancela peticiones ya despachadas (el cliente HTTP no acepta
 * `AbortSignal`); detiene el despacho de las que faltan y marca el resto como
 * `skipped`. Abortar en el desmontaje evita la consecuencia que sí importa:
 * pintar un resultado sobre un componente que ya no existe.
 */
export async function runBulkAction<TItem>(
	items: readonly TItem[],
	worker: (item: TItem) => Promise<unknown>,
	options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<BulkOutcome<TItem>> {
	const concurrency = Math.max(
		1,
		Math.min(options.concurrency ?? BULK_CONCURRENCY, items.length),
	);
	// El resultado de cada fila se guarda por su POSICIÓN en la lista original,
	// no por el orden de llegada: el recibo se lee en el mismo orden en que el
	// operador vio las filas.
	const outcomes = new Map<
		number,
		{ ok: true } | { ok: false; error: unknown }
	>();
	const queue = items.map((item, index) => ({ item, index }));

	// Una cola compartida reparte el trabajo: cada worker toma la siguiente fila
	// libre. Frente a lotes de tamaño fijo, una fila lenta no congela a las
	// demás de su tanda.
	const drain = async (): Promise<void> => {
		for (;;) {
			if (options.signal?.aborted) return;
			const entry = queue.shift();
			if (!entry) return;
			try {
				await worker(entry.item);
				outcomes.set(entry.index, { ok: true });
			} catch (error) {
				outcomes.set(entry.index, { ok: false, error });
			}
		}
	};

	await Promise.all(Array.from({ length: concurrency }, drain));

	const succeeded: TItem[] = [];
	const failed: BulkFailure<TItem>[] = [];
	const skipped: TItem[] = [];
	items.forEach((item, index) => {
		const outcome = outcomes.get(index);
		if (!outcome) {
			skipped.push(item);
			return;
		}
		if (outcome.ok) {
			succeeded.push(item);
			return;
		}
		failed.push({
			item,
			error: outcome.error,
			requestId:
				outcome.error instanceof ApiClientError
					? outcome.error.requestId
					: undefined,
		});
	});
	return { succeeded, failed, skipped };
}
