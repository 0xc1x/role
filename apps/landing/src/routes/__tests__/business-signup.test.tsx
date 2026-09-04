import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@/test-utils/dom";

mock.module("@/components/navbar", () => ({ Navbar: () => null }));
mock.module("@/components/footer", () => ({ Footer: () => null }));
mock.module("@/lib/supabase", () => ({ supabase: null }));

import { Route } from "../business-signup";

const Page = Route.options.component as () => React.JSX.Element;

function setup() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	globalThis.fetch = (async () =>
		new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
	const utils = render(
		<QueryClientProvider client={qc}>
			<Page />
		</QueryClientProvider>,
	);
	// happy-dom aplica validación nativa (required); el form real se
	// valida en JS, así que se desactiva aquí para probar esa lógica.
	utils.container.querySelector("form")?.setAttribute("novalidate", "");
	return utils;
}

async function fillValid(container: HTMLElement) {
	fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
		target: { value: "Ana Pérez" },
	});
	fireEvent.change(screen.getByPlaceholderText("tu@email.com"), {
		target: { value: "ana@test.cl" },
	});
	const passwords = container.querySelectorAll('input[type="password"]');
	fireEvent.change(passwords[0] as HTMLElement, { target: { value: "clave123" } });
	fireEvent.change(passwords[1] as HTMLElement, { target: { value: "clave123" } });
	fireEvent.change(screen.getByPlaceholderText("Panadería La Espiga"), {
		target: { value: "Mi Pan" },
	});
}

describe("BusinessSignupPage", () => {
	test("valida campos requeridos y contraseñas", async () => {
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(
			await screen.findByText("Completa todos los campos y verifica la contraseña"),
		).toBeDefined();
	});

	test("sin supabase muestra error de configuración", async () => {
		const { container } = setup();
		await fillValid(container);
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(
			await screen.findByText("Configuración de Supabase no disponible"),
		).toBeDefined();
	});
});
