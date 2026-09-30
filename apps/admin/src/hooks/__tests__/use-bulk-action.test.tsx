import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@/test-utils/dom";
import { useBulkAction } from "../use-bulk-action";

/** Puerta manual: deja el lote en vuelo hasta que el test la abre. */
function gate() {
	let release: (() => void) | null = null;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release: () => release?.() };
}

afterEach(cleanup);

describe("useBulkAction", () => {
	test("entrega el recibo del lote y vuelve a estado ocioso", async () => {
		const { result } = renderHook(() => useBulkAction());

		let succeeded: number[] = [];
		let failed: number[] = [];
		await act(async () => {
			const outcome = await result.current.run([1, 2, 3], async (item) => {
				if (item === 2) throw new Error("boom");
			});
			succeeded = outcome?.succeeded ?? [];
			failed = outcome?.failed.map((f) => f.item) ?? [];
		});

		expect(succeeded).toEqual([1, 3]);
		expect(failed).toEqual([2]);
		await waitFor(() => expect(result.current.isPending).toBe(false));
	});

	// El `setState` del recibo sobre un componente desmontado es un "se
	// actualizaron 8" pintado en una pantalla en la que el operador ya no está.
	// `run` devuelve `null` para que el call site no tenga que pintar nada.
	test("desmontar en mitad del lote aborta y anula el resultado", async () => {
		const { result, unmount } = renderHook(() => useBulkAction());
		const started: number[] = [];
		const hold = gate();
		let outcome: unknown = "sin ejecutar";

		// `act` sincrónico: solo cubre el `setIsPending(true)` del arranque. El
		// resto de la corrida queda fuera a propósito, porque su destino es un
		// componente que este test va a desmontar.
		let running!: Promise<void>;
		act(() => {
			running = result.current
				.run([0, 1, 2, 3], async (item) => {
					started.push(item);
					await hold.promise;
				})
				.then((value) => {
					outcome = value;
				});
		});

		await waitFor(() => expect(started.length).toBeGreaterThan(0));
		const dispatchedBeforeUnmount = [...started];
		unmount();
		hold.release();
		await running;

		expect(outcome).toBeNull();
		// Tras el aborto ninguna fila nueva entra al pool.
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(started).toEqual(dispatchedBeforeUnmount);
	});

	test("una segunda corrida deja huérfana a la primera", async () => {
		const { result } = renderHook(() => useBulkAction());
		const hold = gate();
		let first: unknown = "sin ejecutar";

		let firstSettled!: Promise<void>;
		act(() => {
			firstSettled = result.current
				.run([0], async () => hold.promise)
				.then((value) => {
					first = value;
				});
		});

		await act(async () => {
			await result.current.run([9], async () => undefined);
		});
		hold.release();
		await firstSettled;

		expect(first).toBeNull();
		await waitFor(() => expect(result.current.isPending).toBe(false));
	});
});
