import { afterEach, describe, expect, test } from "bun:test";
import type { AnnouncementDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { columns } from "../announcements.columns";
import { ActionCell } from "../cells/action-cell";

/**
 * El verbo de la acción destructiva de un aviso, y el diálogo que la confirma.
 *
 * El `DELETE` de announcements es un soft delete: `active = false`. Con el verbo
 * default ("Eliminar", en rojo destructivo) el operador leía que la fila se
 * perdía, y el diálogo le decía dos segundos después que no se borra nada. El
 * verbo del menú es el primero que se lee y el que fija la expectativa.
 */
const aviso: AnnouncementDto = {
	id: "11111111-1111-4111-8111-111111111111",
	title: "Mantenimiento del sábado",
	body: "No hay ofertas nuevas entre las 3 y las 5 de la tarde.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T10:00:00.000Z",
	updated_at: "2026-10-01T10:00:00.000Z",
};

const previousFetch = globalThis.fetch;

function renderCelda() {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(aviso), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ActionCell
				row={{ original: aviso } as unknown as Row<AnnouncementDto>}
			/>
		</QueryClientProvider>,
	);
}

/** El `menuitem` destructivo: el que no es "Copiar ID" ni "Editar". */
async function abrirElMenu() {
	fireEvent.click(screen.getByRole("button", { name: /Abrir menú/ }));
	const items = await screen.findAllByRole("menuitem");
	const destructiva = items.find(
		(i) =>
			!i.textContent?.includes("Editar") && !i.textContent?.includes("Copiar"),
	);
	if (!destructiva) throw new Error("el menú no trae la acción destructiva");
	return destructiva;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("la acción destructiva de un aviso", () => {
	test("el menú dice Desactivar, no Eliminar", async () => {
		renderCelda();

		expect((await abrirElMenu()).textContent).toContain("Desactivar aviso");
		expect(screen.queryByText(/Eliminar aviso/)).toBeNull();
	});

	test("el diálogo de confirmación dice lo mismo y aclara que la fila se conserva", async () => {
		renderCelda();
		fireEvent.click(await abrirElMenu());

		expect(await screen.findByText("¿Desactivar este aviso?")).toBeDefined();
		const dialogo = await screen.findByRole("alertdialog");
		expect(dialogo.textContent).toContain("No se borra nada");
		expect(dialogo.textContent).toContain("la fila se conserva");
		// Y ninguna promesa de borrado irreversible: el `DELETE` pone
		// `active = false` y la fila se puede volver a activar desde la edición.
		expect(dialogo.textContent).not.toContain("permanentemente");
		expect(dialogo.textContent).not.toContain("no se puede deshacer");
		expect(dialogo.textContent).toContain("volver a activarla");
	});
});

/**
 * La celda de estado es un switch, no un badge. Bajar un aviso es la operación
 * de rutina de esta pantalla, y pedir un drawer para cada una es un costo por
 * aviso que se apaga.
 *
 * Y el PATCH de un campo NO choca con el predicado de audiencia del service:
 * `assertAudienceHasTargets` lee `body.user_ids ?? existing.user_ids`, así que un
 * `{ active: false }` cae a las listas GUARDADAS y pasa siempre que la fila sea
 * alcanzable por la API —y una `specific` con las dos listas vacías no lo es.
 */
describe("la celda de estado", () => {
	test("el switch de la fila manda un PATCH de un solo campo", async () => {
		const calls: Array<{ method: string; url: string; body: unknown }> = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			calls.push({
				method: init?.method ?? "GET",
				url: String(input),
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			return new Response(JSON.stringify(aviso), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		// `accessorKey` vive en la unión de `ColumnDef`, así que el `find` necesita
		// el narrowing explícito: sin él, `c.accessorKey` no existe en la rama
		// string de la unión.
		const columna = columns.find(
			(c) => "accessorKey" in c && c.accessorKey === "active",
		);
		const celda = columna && "cell" in columna ? columna.cell : undefined;
		if (!celda) throw new Error("la columna de estado no tiene celda");

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		render(
			<QueryClientProvider client={queryClient}>
				<div>
					{(
						celda as unknown as (props: {
							row: { original: AnnouncementDto };
						}) => React.ReactNode
					)({ row: { original: aviso } })}
				</div>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("switch", { name: /Aviso activa/ }));

		await waitFor(() => expect(calls.length).toBe(1));
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain(`/announcements/${aviso.id}`);
		// Un solo campo: la audiencia no se toca, así que el `??` del service cae
		// a las listas guardadas y el aviso no cambia de destinatario.
		expect(calls[0]?.body).toEqual({ active: false });
	});
});
