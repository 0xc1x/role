import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@/test-utils/dom";

mock.module("@/components/navbar", () => ({ Navbar: () => null }));
mock.module("@/components/footer", () => ({ Footer: () => null }));
// La página usa <Link> del router; fuera de un RouterProvider crashea React.
// Para el test basta un Link tonto y un createFileRoute que devuelva options.
// El `href` sí se pasa: los enlaces de consentimiento y los de la app son lo
// que hay que verificar, y un mock que se come el destino no verifica nada.
mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({ options }),
	Link: (props: {
		children?: React.ReactNode;
		className?: string;
		to?: string;
	}) => (
		<a href={props.to} className={props.className}>
			{props.children}
		</a>
	),
}));

import { Route } from "../business-signup";

const Page = Route.options.component as () => React.JSX.Element;

const DRAFT_KEY = "role-business-signup-draft";

interface CapturedRequest {
	url: string;
	body: unknown;
}

function setup(onboarding?: { status: number; message: string }) {
	const captured: CapturedRequest[] = [];
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	globalThis.sessionStorage = window.sessionStorage;
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

/** Monta la página en un QueryClient nuevo (simula una navegación de vuelta). */
function mount() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const utils = render(
		<QueryClientProvider client={qc}>
			<Page />
		</QueryClientProvider>,
	);
	utils.container.querySelector("form")?.setAttribute("novalidate", "");
	return utils;
}

describe("BusinessSignupPage", () => {
	afterEach(() => {
		cleanup();
		window.sessionStorage.clear();
	});

	test("valida campos requeridos y contraseñas", async () => {
		const { captured } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(await screen.findByText("Ingresa un email válido")).toBeDefined();
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

	// ESTE TEST CAMBIÓ. Antes afirmaba el defecto: que un 409 del backend
	// ("Email is already registered", inglés) se mostrara crudo en un
	// formulario en español, sin ninguna salida. Ahora afirma el texto en
	// español y el enlace a iniciar sesión. No se eliminó ni se relajó: se
	// cambió la expectativa porque el comportamiento corregido es el nuevo.
	test("un 409 se traduce y ofrece la ruta para iniciar sesión", async () => {
		const { container } = setup({
			status: 409,
			message: "Email is already registered",
		});
		await fillValid(container);
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));

		expect(
			await screen.findByText("Ya existe una cuenta con este correo."),
		).toBeDefined();
		// El inglés del backend no puede filtrarse al usuario final.
		expect(screen.queryByText("Email is already registered")).toBeNull();
		// Y el mensaje dice qué hacer, con un enlace real.
		expect(
			screen.getByText(/Puede que ya te hayas registrado antes/),
		).toBeDefined();
		const signIn = screen.getByRole("link", {
			name: "Iniciar sesión en la app de Rolé",
		});
		expect(signIn.getAttribute("href")).toBeTruthy();
	});

	test("un 409 no borra lo que el usuario ya escribió", async () => {
		const { container } = setup({
			status: 409,
			message: "Email is already registered",
		});
		await fillValid(container);
		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));

		await screen.findByText("Ya existe una cuenta con este correo.");
		expect(
			(screen.getByPlaceholderText("tu@email.com") as HTMLInputElement).value,
		).toBe("ana@test.cl");
	});
});

describe("borrador del formulario", () => {
	afterEach(() => {
		cleanup();
		window.sessionStorage.clear();
	});

	test("sobrevive a un remontaje", async () => {
		setup();
		fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
			target: { value: "Ana Pérez" },
		});
		fireEvent.change(screen.getByPlaceholderText("tu@email.com"), {
			target: { value: "ana@test.cl" },
		});
		fireEvent.change(screen.getByPlaceholderText("Panadería La Espiga"), {
			target: { value: "Mi Pan" },
		});
		fireEvent.change(screen.getByPlaceholderText("+593 ..."), {
			target: { value: "+593 99" },
		});

		// Se desmonta y se vuelve a montar: es lo que pasa al recargar.
		cleanup();
		mount();

		const value = (placeholder: string) =>
			(screen.getByPlaceholderText(placeholder) as HTMLInputElement).value;
		expect(value("Nombre completo")).toBe("Ana Pérez");
		expect(value("tu@email.com")).toBe("ana@test.cl");
		expect(value("Panadería La Espiga")).toBe("Mi Pan");
		expect(value("+593 ...")).toBe("+593 99");
	});

	test("nunca guarda la contraseña", () => {
		const { container } = setup();
		fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
			target: { value: "Ana Pérez" },
		});
		const passwords = container.querySelectorAll('input[type="password"]');
		fireEvent.change(passwords[0] as HTMLElement, {
			target: { value: "clave123" },
		});

		const raw = window.sessionStorage.getItem(DRAFT_KEY) ?? "";
		expect(raw).not.toContain("clave123");
		expect(JSON.parse(raw || "{}")).not.toHaveProperty("password");
	});

	test("se borra cuando el registro se confirma", async () => {
		const { container } = setup({ status: 201, message: "Solicitud recibida" });
		await fillValid(container);
		expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Registrar negocio" }));
		expect(await screen.findByText("¡Recibimos tu solicitud!")).toBeDefined();
		expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
	});

	test("sobrevive a un borrador corrupto en vez de romper el formulario", () => {
		window.sessionStorage.setItem(DRAFT_KEY, "{no es json");
		expect(() => setup()).not.toThrow();
		expect(
			(screen.getByPlaceholderText("Nombre completo") as HTMLInputElement)
				.value,
		).toBe("");
	});

	test("si el usuario lo vacía, el borrador no queda guardado", () => {
		setup();
		fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
			target: { value: "Ana" },
		});
		fireEvent.change(screen.getByPlaceholderText("Nombre completo"), {
			target: { value: "" },
		});
		expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
	});
});

describe("consentimiento en el alta", () => {
	afterEach(() => {
		cleanup();
		window.sessionStorage.clear();
	});

	test("enlaza los documentos legales que existen de verdad", () => {
		setup();
		// `/terms` y `/privacy` son rutas reales del sitio (src/routes/*.tsx).
		expect(
			screen
				.getByRole("link", { name: "términos y condiciones" })
				.getAttribute("href"),
		).toBe("/terms");
		expect(
			screen
				.getByRole("link", { name: "política de privacidad" })
				.getAttribute("href"),
		).toBe("/privacy");
	});

	test("el texto de consentimiento acompaña a los enlaces", () => {
		setup();
		const consent = screen.getByText(
			/Al registrar tu negocio creas una cuenta/,
		);
		expect(consent.textContent).toContain("términos y condiciones");
		expect(consent.textContent).toContain("política de privacidad");
	});
});
