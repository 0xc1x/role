import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@/test-utils/dom";
import { ResourceActionCell } from "../resource-action-cell";

/**
 * `deleteVerb` existe porque `DELETE` en este panel no siempre borra.
 *
 * `announcements` y `tips` lo usan como soft delete (`active = false` /
 * `deleted_at`), y su verbo decía "Eliminar" en rojo destructivo: el operador
 * leía que la fila se perdía y el diálogo de confirmación, dos segundos después,
 * le decía lo contrario. El verbo del MENÚE es el primero que se lee y el que
 * fija la expectativa.
 *
 * El default sigue siendo "Eliminar": las entidades con borrado real —coupons
 * hace `.delete(coupons)`— no tienen que pasar nada.
 */
type Entidad = { id: string; titulo: string };

const entidad: Entidad = {
	id: "11111111-1111-4111-8111-111111111111",
	titulo: "Mantenimiento del sábado",
};

const sinBorrar = () => ({
	mutate: () => {},
	reset: () => {},
	isPending: false,
	error: null,
});

// El genérico va explícito en los dos lugares. `typeof ResourceActionCell` a
// secas resuelve `TRow` a su constraint (`{ id: string }`), y el `{...props}`
// re-ensanchaba `row` a `Row<{ id: string }>` — sin `titulo` para `displayName`.
// La "instantiation expression" es la forma de fijar el argumento.
type PropsCelda = ComponentProps<typeof ResourceActionCell<Entidad>>;

function renderCelda(props: Partial<PropsCelda>) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	// El `Row` real de TanStack tiene una forma enorme y ninguno de sus campos
	// participa en esta celda; el narrow documenta eso.
	const fila = { original: entidad } as unknown as Row<Entidad>;
	return render(
		<QueryClientProvider client={queryClient}>
			<ResourceActionCell<Entidad>
				row={fila}
				entityName="aviso"
				displayName={(e) => e.titulo}
				editLabel="Editar aviso"
				deleteTitle="¿Desactivar este aviso?"
				deleteDescription={(name) => <p>desactivar {name}</p>}
				useDelete={sinBorrar}
				renderEditor={() => null}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

/**
 * Abre el menú de la celda y lee el texto de la acción destructiva.
 *
 * El `getAllByRole` y no el `getByRole`: el menú trae varias `menuitem` y dos
 * terminan en "aviso" —la destructiva y la de editar—, así que la destructiva se
 * distingue por ser la que no empieza con "Editar".
 */
async function accionDestructiva() {
	fireEvent.click(screen.getByRole("button", { name: /Abrir menú/ }));
	const items = await screen.findAllByRole("menuitem", { name: /aviso$/ });
	const destructiva = items.find(
		(i) =>
			!i.textContent?.includes("Editar") && !i.textContent?.includes("Copiar"),
	);
	if (!destructiva) throw new Error("el menú no trae la acción destructiva");
	return destructiva;
}

/** El texto de la acción destructiva del menú. */
async function textoDeLaAccion() {
	return (await accionDestructiva()).textContent;
}

afterEach(cleanup);

describe("el verbo de la acción destructiva", () => {
	test("sin deleteVerb dice Eliminar: el default de toda entidad con borrado real", async () => {
		renderCelda({});

		expect(await textoDeLaAccion()).toContain("Eliminar aviso");
	});

	test("con deleteVerb dice el verbo del feature", async () => {
		renderCelda({ deleteVerb: "Desactivar" });

		expect(await textoDeLaAccion()).toContain("Desactivar aviso");
		// Y NO el default hardcodeado: era exactamente lo que había que cambiar.
		expect(screen.queryByText(/Eliminar aviso/)).toBeNull();
	});

	test("el botón de confirmación usa el mismo verbo que el menú", async () => {
		renderCelda({ deleteVerb: "Desactivar" });
		fireEvent.click(await accionDestructiva());

		// Si el menú dice una cosa y el botón otra, el operador ve la contradicción
		// en el momento de confirmar, que es el peor lugar.
		expect(
			await screen.findByRole("button", { name: "Desactivar aviso" }),
		).toBeDefined();
	});
});
