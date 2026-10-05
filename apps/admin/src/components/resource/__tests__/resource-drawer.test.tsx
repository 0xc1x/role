import { afterEach, describe, expect, test } from "bun:test";
import {
	QueryClient,
	QueryClientProvider,
	useMutation,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import {
	ResourceUpdateDrawer,
	useReportDrawerPending,
} from "../resource-drawer";

/**
 * A21: el submit del drawer se deshabilitaba con `useIsMutating({ mutationKey })`,
 * un contador GLOBAL de `["businesses"]`. La mutación de una fila apagaba el
 * "Guardar" de todas las demás sin explicación — en una sesión de verificación
 * en lote, el submit moría en drawers que nadie estaba tocando.
 *
 * Un drawer por test: Base UI no apila dos modales en happy-dom.
 */

const businessesKey = ["businesses"] as const;

function PendingForm({ pending }: { pending: boolean }) {
	useReportDrawerPending(pending);
	return <form id="drawer-form" />;
}

/** Mutación en vuelo con la misma clave global que usan todas las filas. */
function ForeignMutationInFlight() {
	const mutation = useMutation({
		mutationKey: businessesKey,
		mutationFn: () => new Promise<string>(() => undefined),
	});
	useEffect(() => {
		mutation.mutate();
	}, [mutation.mutate]);
	return <span>{mutation.isPending ? "guardando" : "idle"}</span>;
}

function renderDrawer(pending: boolean, withForeignMutation = false) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			{withForeignMutation ? <ForeignMutationInFlight /> : null}
			<ResourceUpdateDrawer
				formId="drawer-form"
				title="Editar negocio"
				description="Café Central"
				isOpen
				onClose={() => undefined}
				submitLabel="Guardar"
				updatingLabel="Guardando"
			>
				<PendingForm pending={pending} />
			</ResourceUpdateDrawer>
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("submit del drawer", () => {
	// La regresión directa: la mutación de OTRA fila, con la misma clave global,
	// ya no apaga el submit de este drawer.
	test("la mutación de otra fila no deshabilita el submit", async () => {
		renderDrawer(false, true);

		await waitFor(() => expect(screen.getByText("guardando")).toBeDefined());
		const guardar = screen.getByRole("button", { name: "Guardar" });
		expect((guardar as HTMLButtonElement).disabled).toBe(false);
	});

	test("el submit se deshabilita solo cuando su propio form está guardando", async () => {
		renderDrawer(true);

		await waitFor(() => expect(screen.getByText("Guardando")).toBeDefined());
		const pending = screen.getByRole("button", { name: /Guardando/ });
		expect((pending as HTMLButtonElement).disabled).toBe(true);
		expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
	});

	test("un drawer quieto deja el submit habilitado", () => {
		renderDrawer(false);

		const guardar = screen.getByRole("button", { name: "Guardar" });
		expect((guardar as HTMLButtonElement).disabled).toBe(false);
	});
});

describe("HTML válido", () => {
	/**
	 * `DrawerClose` es `Dialog.Close` de Base UI, que ya renderiza un `<button>`.
	 * Envolverlo con `<Button>` (en vez de usar el prop `render`) produce
	 * `<button><button></button></button>`: HTML inválido que React reporta como
	 * error de hidratación en el cliente, y que rompe teclado y lector de
	 * pantalla aunque los tests sigan verdes.
	 *
	 * El mismo chequeo sobre `document` y no sobre un solo botón: el nesting
	 * puede aparecer en cualquier slot del footer, y este archivo cubre create y
	 * update.
	 */
	test("ningún botón del drawer contiene otro botón", () => {
		renderDrawer(false);

		// `document.body` y no el container del render: Base UI monta el popup en
		// un portal fuera del árbol del componente, así que el container vacío
		// haría pasar la aserción sin comprobar nada.
		const anidados = Array.from(
			document.body.querySelectorAll("button button"),
		).map((inner) => inner.textContent?.trim());

		expect(anidados).toEqual([]);
	});
});
