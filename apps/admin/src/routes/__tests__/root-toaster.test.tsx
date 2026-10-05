import { afterEach, describe, expect, mock, test } from "bun:test";
import { createRoot } from "react-dom/client";
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

const { act, cleanup, screen } = await import("@/test-utils/dom");

type ShellProps = { children: React.ReactNode };
const RootDocument = (
	Route as unknown as { shellComponent: React.ComponentType<ShellProps> }
).shellComponent;

/**
 * `RootDocument` renderiza `<html>`, `<head>` y `<body>`: es el documento
 * entero, no un fragmento. El `render` de testing-library lo montaba en un `div`
 * —el container por default— y React reportaba
 * `In HTML, <html> cannot be a child of <div>`.
 *
 * NO es un warning que se pueda silenciar sin perder lo que dice: el shell
 * documenta ese HTML y solo es correcto en la raíz del documento. Montarlo con
 * `createRoot(document)` reproduce el montaje real de TanStack Start.
 *
 * El `createRoot` en vez de `render()` a propósito: el `container` de
 * testing-library tiene que ser un `HTMLElement`, y para este componente el
 * container correcto es el `Document`.
 */
function renderRootDocument() {
	const root = createRoot(document);
	act(() => {
		root.render(
			<RootDocument>
				<div>panel</div>
			</RootDocument>,
		);
	});
	return root;
}

afterEach(() => {
	cleanup();
	toast.dismiss();
});

describe("documento raíz del admin", () => {
	test("monta el toaster, así que los toast.* no son no-ops", async () => {
		const root = renderRootDocument();

		expect(screen.getByLabelText(/notifications/i)).toBeDefined();

		toast.success("Negocio aprobado");
		expect(await screen.findByText("Negocio aprobado")).toBeDefined();

		await act(async () => {
			root.unmount();
		});
	});
});
