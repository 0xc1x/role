import { describe, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@/test-utils/dom";
import { IdPicker } from "../id-picker";

function setup(ui: React.ReactElement) {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function stubProfiles(
	profiles: Array<{ id: string; full_name: string | null; email: string }>,
) {
	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				data: profiles,
				meta: { page: 1, limit: 10, total: profiles.length },
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		)) as unknown as typeof fetch;
}

describe("IdPicker", () => {
	test("lista usuarios y alterna selección", async () => {
		stubProfiles([{ id: "u-1", full_name: "Ana", email: "a@b.cl" }]);
		const onChange = jest.fn();
		setup(
			<IdPicker
				label="Usuarios"
				kind="usuarios"
				selectedIds={[]}
				onChange={onChange}
			/>,
		);
		expect(await screen.findByText("Ana · a@b.cl")).toBeDefined();
		const box = screen.getByRole("checkbox");
		box.click();
		expect(onChange).toHaveBeenCalledWith(["u-1"]);
	});

	test("muestra seleccionados y permite quitar", async () => {
		stubProfiles([]);
		const onChange = jest.fn();
		setup(
			<IdPicker
				label="U"
				kind="usuarios"
				selectedIds={["u-12345678"]}
				onChange={onChange}
			/>,
		);
		expect(await screen.findByText("Sin resultados")).toBeDefined();
		screen.getByRole("button", { name: "Quitar u-12345678" }).click();
		expect(onChange).toHaveBeenCalledWith([]);
	});

	test("withPushToken filtra por token en el query", async () => {
		let url = "";
		globalThis.fetch = (async (input: unknown) => {
			url = String(input);
			return new Response(
				JSON.stringify({ data: [], meta: { page: 1, limit: 10, total: 0 } }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;
		setup(
			<IdPicker
				label="U"
				kind="usuarios"
				selectedIds={[]}
				onChange={() => {}}
				withPushToken
			/>,
		);
		await screen.findByText("Sin resultados");
		expect(url).toContain("has_active_push_token=true");
	});
});
