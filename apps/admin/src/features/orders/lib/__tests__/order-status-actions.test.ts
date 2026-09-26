import { describe, expect, test } from "bun:test";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "@0xc1x/role-commons";
import { orderStatusActions } from "../order-status-actions";

/**
 * El desplegable de la fila ofrece lo que el grafo permite y nada más. Si
 * apareciera un estado completo, el operador descubriría por un 422 que la
 * transición no era legal, y un 422 no es un mensaje de soporte.
 */

const ESPERADAS = {
	pending: ["Confirmada", "Cancelada", "Vencida"],
	confirmed: ["Lista para recoger", "Cancelada"],
	ready_for_pickup: ["Recogida", "Cancelada", "Vencida"],
	picked_up: ["Completada"],
	completed: [],
	cancelled: [],
	expired: [],
} as const satisfies Record<(typeof ORDER_STATUSES)[number], string[]>;

describe("opciones de transición por estado", () => {
	test.each(
		Object.entries(ESPERADAS),
	)("%s ofrece exactamente sus aristas salientes", (status, labels) => {
		const offered = orderStatusActions(
			status as Parameters<typeof orderStatusActions>[0],
		).map((a) => a.label);

		expect(offered).toEqual(labels);
	});

	// El grafo es la SSOT: si se le agrega una arista, el panel tiene que
	// ofrecerla sin que nadie recuerde actualizar esta lista.
	test("el número de opciones es el grado saliente del grafo en cada estado", () => {
		for (const status of ORDER_STATUSES) {
			expect(orderStatusActions(status)).toHaveLength(
				ORDER_TRANSITIONS[status].length,
			);
		}
	});

	// Un estado terminal no tiene a dónde ir: un botón que solo puede producir
	// un 422 es ruido en la fila.
	test.each([
		"completed",
		"cancelled",
		"expired",
	] as const)("%s no ofrece ninguna acción", (status) => {
		expect(orderStatusActions(status)).toEqual([]);
	});

	test("cancelled y expired se pintan como acción destructiva", () => {
		const actions = orderStatusActions("pending");
		expect(actions.find((a) => a.status === "cancelled")?.destructive).toBe(
			true,
		);
		expect(actions.find((a) => a.status === "expired")?.destructive).toBe(true);
		expect(actions.find((a) => a.status === "confirmed")?.destructive).toBe(
			false,
		);
	});
});
