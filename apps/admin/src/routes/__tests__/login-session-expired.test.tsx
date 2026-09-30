import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A9: al caer la sesión el operador vuelve al login con `from` (dónde estaba) y
 * `reason=expired` (por qué). El login explica la caída y devuelve al operador a
 * esa ruta tras volver a entrar.
 */
const actualRouter = await import("@tanstack/react-router");
let currentSearch: Record<string, unknown> = {};

mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => currentSearch,
	}),
	useNavigate: () => () => undefined,
	redirect: () => undefined,
}));

const { Route: loginRoute } = await import("../login");

const { cleanup, render, screen } = await import("@/test-utils/dom");

type LoginProps = Record<string, never>;
const LoginPage = (
	loginRoute as unknown as {
		component: (props: LoginProps) => React.ReactElement;
	}
).component as unknown as (props: LoginProps) => React.ReactElement;
// El mock de `createFileRoute` devuelve las options en el objeto de la ruta.
const validateSearch = (
	loginRoute as unknown as {
		validateSearch: (raw: Record<string, unknown>) => unknown;
	}
).validateSearch;

function renderLogin() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<LoginPage {...({} as LoginProps)} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	mock.restore();
	currentSearch = {};
});

describe("search del login", () => {
	test("acepta la ruta interna y la razón de sesión expirada", () => {
		expect(validateSearch({ from: "/negocios", reason: "expired" })).toEqual({
			from: "/negocios",
			reason: "expired",
		});
	});

	// Un `//host` o un `https://…` en `from` convertiría el login en un
	// redirector abierto.
	test("descarta destinos externos", () => {
		expect(
			validateSearch({ from: "//evil.example", reason: "expired" }),
		).toEqual({ reason: "expired" });
		expect(
			validateSearch({ from: "https://evil.example", reason: "expired" }),
		).toEqual({ reason: "expired" });
	});

	test("omite las claves vacías para no volver obligatorio el search", () => {
		expect(validateSearch({})).toEqual({});
	});
});

describe("pantalla de login", () => {
	test("explica que la sesión expiró", () => {
		currentSearch = { from: "/negocios", reason: "expired" };
		renderLogin();

		expect(screen.getByText(/Tu sesión expiró por seguridad/i)).toBeDefined();
	});

	test("no muestra el aviso en un login normal", () => {
		currentSearch = {};
		renderLogin();

		expect(screen.queryByText(/Tu sesión expiró/i)).toBeNull();
		expect(
			screen.getByRole("button", { name: "Iniciar Sesión" }),
		).toBeDefined();
	});
});
