import { afterEach, describe, expect, test } from "bun:test";
import type { AppConfigDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@/test-utils/dom";
import { AppConfigForm } from "../app-config.form";

/**
 * El placeholder del campo "Valor" cuando el tipo es `email`.
 *
 * POR QUÉ AFIRMA ESTO Y NO NADA: el placeholder es lo que el operador ve
 * mientras escribe el valor de una fila de `app_config` —`support.email`,
 * `contact.hola_email`— y esos valores son los que la landing y el móvil
 * muestran a una persona. Un ejemplo en el dominio viejo (`role.app`, el
 * dominio anterior al adquirido) es un ejemplo de una dirección que ya no
 * existe: el operador lo copia y el correo no llega.
 */
const EMAIL: AppConfigDto = {
	key: "support.email",
	value: "soporte@role.ec",
	value_type: "email",
	category: "contacto",
	label: "Correo de soporte",
	description: null,
	is_public: true,
	active: true,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};

afterEach(() => {
	cleanup();
});

describe("el ejemplo del campo de valor", () => {
	test("para un email, el ejemplo está en el dominio del producto", () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		render(
			<QueryClientProvider client={queryClient}>
				<AppConfigForm formId="app-config-form" config={EMAIL} />
			</QueryClientProvider>,
		);

		const input = screen.getByLabelText("Valor");
		expect(input.getAttribute("placeholder")).toBe("soporte@role.ec");
	});
});
