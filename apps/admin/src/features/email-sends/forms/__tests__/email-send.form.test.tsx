import { afterEach, describe, expect, test } from "bun:test";
import type { EmailSendDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { EmailSendForm } from "../email-send.form";

/**
 * El form de envío era un `textarea` sobre `error_message`: el operador
 * escribía a mano el motivo de un fallo y el PATCH lo persistía. Eso devolvía
 * por la puerta de atrás la fuga que a7fac68 cerró en el camino de fallo del
 * servidor, porque el texto crudo de Resend puede traer identificadores de la
 * cuenta del proveedor y el email del destinatario.
 *
 * Estos dos casos fijan la forma del contrato desde el cliente: el PATCH lleva
 * solo el estado, y el detalle del error se muestra sin ser editable.
 */

const send: EmailSendDto = {
	id: "11111111-1111-4111-8111-111111111111",
	type: "transactional",
	source_type: "business",
	source_id: "22222222-2222-4222-8222-222222222222",
	template_id: "33333333-3333-4333-8333-333333333333",
	user_id: null,
	email: "postulante@cafe-central.ec",
	variables_used: null,
	resend_id: null,
	status: "failed",
	attempts: 5,
	max_attempts: 5,
	error_message: "Error",
	error_code: null,
	scheduled_at: null,
	queued_at: null,
	processed_at: null,
	sent_at: null,
	delivered_at: null,
	opened_at: null,
	clicked_at: null,
	bounced_at: null,
	created_at: "2026-09-01T10:00:00.000Z",
	updated_at: null,
};

const previousFetch = globalThis.fetch;

type Captured = { method: string; url: string; body: string | null };

function stubFetch(): Captured[] {
	const calls: Captured[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			method: init?.method ?? "GET",
			url: String(input),
			body: typeof init?.body === "string" ? init.body : null,
		});
		return new Response(JSON.stringify(send), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
}

function renderForm() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<EmailSendForm formId="email-send-form" send={send} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("payload del PATCH de un envío", () => {
	test("lleva solo el estado, nunca el detalle del error", async () => {
		const calls = stubFetch();
		renderForm();

		const form = document.getElementById("email-send-form");
		if (!form) throw new Error("el form de envío no se renderizó");
		fireEvent.submit(form);

		await waitFor(() => expect(calls.length).toBeGreaterThan(0));
		const patch = calls[0];
		expect(patch?.method).toBe("PATCH");
		expect(patch?.url).toContain(`/email-marketing/sends/${send.id}`);
		// `error_message` y `error_code` son diagnósticos del servidor: si
		// volvieran en el body, el contrato (`strict`) los rechazaría con un 400
		// y el operador vería un fallo sin explicación.
		expect(JSON.parse(patch?.body ?? "{}")).toEqual({ status: "failed" });
	});
});

describe("detalle del error en el drawer de envío", () => {
	test("se muestra como dato del servidor y no como campo editable", () => {
		renderForm();

		expect(screen.getByText("Detalle del error del servidor")).toBeDefined();
		expect(screen.getByText("Error")).toBeDefined();
		// Read-only de verdad: no hay control de formulario que lo modifique.
		const editable = document.querySelectorAll(
			'input, textarea, select, [contenteditable="true"]',
		);
		for (const el of Array.from(editable)) {
			expect(el.getAttribute("value")).not.toBe("Error");
		}
	});
});
