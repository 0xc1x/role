import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { Contact } from "../contact";

interface CapturedRequest {
	body: unknown;
	url: string;
}

const previousFetch = globalThis.fetch;

function setup() {
	const captured: CapturedRequest[] = [];
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	globalThis.localStorage = window.localStorage;
	globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	globalThis.MutationObserver = window.MutationObserver;
	window.localStorage.clear();
	globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/app-config/public")) {
			return new Response(
				JSON.stringify([
					{
						key: "contact.cities",
						value: ["Quito", "Guayaquil", "Cuenca", "Manta", "Otra", "Otra"],
						value_type: "json",
					},
				]),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		if (url.endsWith("/contact")) {
			captured.push({ body: JSON.parse(String(init?.body)), url });
			return new Response(JSON.stringify({ ok: true }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;

	return {
		...render(
			<QueryClientProvider client={queryClient}>
				<Contact />
			</QueryClientProvider>,
		),
		captured,
	};
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("Contact", () => {
	test("adds Otra manually and preserves the custom city payload", async () => {
		const { captured } = setup();

		fireEvent.click(screen.getByRole("combobox"));
		const otherOption = await screen.findByRole("option", { name: "Otra" });
		for (const city of ["Quito", "Guayaquil", "Cuenca", "Manta"]) {
			expect(screen.getByRole("option", { name: city })).toBeDefined();
		}
		expect(screen.getAllByRole("option", { name: "Otra" })).toHaveLength(1);
		fireEvent.pointerDown(otherOption);
		fireEvent.pointerUp(otherOption);
		fireEvent.click(otherOption);
		expect(screen.getByPlaceholderText("Escribe tu ciudad")).toBeDefined();

		fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), {
			target: { value: "test@example.com" },
		});
		fireEvent.change(screen.getByPlaceholderText("Escribe tu ciudad"), {
			target: { value: "Ambato" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		await waitFor(() => expect(captured).toHaveLength(1));
		expect(captured[0]?.body).toMatchObject({
			city: "Otra",
			city_other: "Ambato",
			email: "test@example.com",
		});
	});
});
