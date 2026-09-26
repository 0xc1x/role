import { afterEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

// HeadContent/Scripts leen el router activo; el shell del documento raíz no lo
// necesita para probar que el toaster está montado.
mock.module("@tanstack/react-router", () => ({
	createRootRouteWithContext: () => (options: unknown) => options,
	HeadContent: () => null,
	Scripts: () => null,
	Link: () => null,
}));

const { Route } = await import("../__root");

const w = globalThis.window as unknown as Record<string, unknown>;
// next-themes (ThemeProvider) consulta matchMedia al montar; happy-dom no lo trae.
w.matchMedia ??= () => ({
	matches: false,
	media: "",
	onchange: null,
	addEventListener: () => {},
	removeEventListener: () => {},
	addListener: () => {},
	removeListener: () => {},
	dispatchEvent: () => false,
});

const { cleanup, render, screen } = await import("@/test-utils/dom");

type ShellProps = { children: React.ReactNode };
const RootDocument = (
	Route as unknown as { shellComponent: React.ComponentType<ShellProps> }
).shellComponent;

afterEach(() => {
	cleanup();
	toast.dismiss();
});

describe("documento raíz del admin", () => {
	test("monta el toaster, así que los toast.* no son no-ops", async () => {
		render(
			<RootDocument>
				<div>panel</div>
			</RootDocument>,
		);

		expect(screen.getByLabelText(/notifications/i)).toBeDefined();

		toast.success("Negocio aprobado");
		expect(await screen.findByText("Negocio aprobado")).toBeDefined();
	});
});
