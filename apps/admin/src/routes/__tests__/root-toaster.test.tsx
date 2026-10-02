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
//
// POR QUÉ ASIGNA Y NO `??=`: el shim tiene que ser RESPONSABLE DE ESTE SPEC, no
// el que otro spec dejó. `src/hooks/__tests__/use-mobile.test.tsx` instala un
// `matchMedia` cuyo `mql` no trae `addListener`, porque a `useIsMobile` no le
// hace falta: con un `??=` este archivo heredaba ese `mql` y next-themes moría
// con `TypeError: o.addListener is not a function` al montar el ThemeProvider.
// El fallo solo aparecía en la suite completa (los specs comparten proceso y el
// orden decide quién pisa a quién) y en `bun test` de este archivo aislado
// pasaba: un test cuyo resultado depende del orden de los archivos no es un test,
// es una ruleta. La asignación sin condición hace que el shim sea el de este
// spec pase lo que pase antes.
w.matchMedia = () => ({
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
