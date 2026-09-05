import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@/test-utils/dom";

mock.module("@/components/navbar", () => ({ Navbar: () => null }));
mock.module("@/components/footer", () => ({ Footer: () => null }));

import { Route } from "../business-signup";

const Page = Route.options.component as () => React.JSX.Element;

interface CapturedRequest {
	url: string;
	body: unknown;
}

function setup(onboarding?: { status: number; message: string }) {
	const captured: CapturedRequest[] = [];
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/businesses/onboarding") && onboarding) {
			captured.push({ url, body: JSON.parse(String(init?.body)) });
			return new Response(JSON.stringify({ message: onboarding.message }), {
				status: onboarding.status,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	const utils = render(
		<QueryClientProvider client={qc}>
			<Page />
		</QueryClientProvider>,
	);
	// happy-dom aplica validación nativa (required); el form real se
	// valida en JS, así que se desactiva aquí para probar esa lógica.
	utils.container.querySelector("form")?.setAttribute("novalidate", "");
	return { ...utils, captured };
}

async function fillValid(container: HTMLElement) {
	fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
		target: { value: "Ana Pérez" },
	});
	fireEvent.change(screen.getByPlaceholderText("tu@email.com"), {
		target: { value: "ana@test.cl" },
	});
	const passwords = container.querySelectorAll('input[type="password"]');
	fireEvent.change(passwords[0] as HTMLElement, {
		target: { value: "clave123" },
	});
	fireEvent.change(passwords[1] as HTMLElement, {
		target: { value: "clave123" },
	});
	fireEvent.change(screen.getByPlaceholderText("Panadería La Espiga"), {
		target: { value: "Mi Pan" },
	});
}

describe("BusinessSignupPage", () => {
	test("valida campos requeridos y contraseñas", async () => {
		const { captured } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(
			await screen.findByText(
				"Completa todos los campos y verifica la contraseña",
			),
		).toBeDefined();
		expect(captured).toHaveLength(0);
	});

	test("envía onboarding a la API y muestra confirmación", async () => {
		const { container, captured } = setup({
			status: 201,
			message: "Solicitud recibida",
		});
		await fillValid(container);
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(await screen.findByText("¡Recibimos tu solicitud!")).toBeDefined();
		expect(captured).toHaveLength(1);
		expect(captured[0]?.url).toContain("/businesses/onboarding");
		expect(captured[0]?.body).toMatchObject({
			email: "ana@test.cl",
			full_name: "Ana Pérez",
			business_name: "Mi Pan",
		});
	});

	test("muestra el error que devuelve la API", async () => {
		const { container } = setup({
			status: 409,
			message: "Email is already registered",
		});
		await fillValid(container);
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(
			await screen.findByText("Email is already registered"),
		).toBeDefined();
	});
});
