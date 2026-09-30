import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ReviewModerationItemDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, renderHook } from "@/test-utils/dom";
import { useHideReview, useUnhideReview } from "../reviews.queries";

/**
 * Moderar es la única acción del panel cuyo fallo no se ve en la pantalla: la
 * fila se queda como estaba y la tabla no cambia. Sin un aviso, un 500 es
 * indistinguible de un click que no se dispara — y el operador no tiene forma de
 * reintentar a ciegas ni de darle nada a soporte.
 *
 * Por eso estos tests fijan el `requestId`: es lo único que correlaciona el
 * toast del operador con el log del servidor.
 */

const previousFetch = globalThis.fetch;

function stubFetch(status: number, body: unknown) {
	const calls: { url: string; method: string; body: string | null }[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? "GET",
			body: typeof init?.body === "string" ? init.body : null,
		});
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
}

const fila: ReviewModerationItemDto = {
	id: "22222222-2222-4222-8222-222222222222",
	user_id: "aaaaaaaa-1111-4111-8111-111111111111",
	business_id: "bbbbbbbb-1111-4111-8111-111111111111",
	order_id: null,
	rating: null,
	comment: "Pésimo",
	product_rating: 1,
	business_rating: 1,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-21T12:00:00.000Z",
	is_hidden: true,
	moderated_at: "2026-09-21T12:00:00.000Z",
	moderated_by: "cccccccc-1111-4111-8111-111111111111",
	moderated_by_name: "Módulo de moderación",
	moderation_reason: "insults_or_hate_speech",
	hidden_reason: "Lenguaje abusivo hacia el personal",
	author_name: "Bruno",
	business_name: "Panadería Sur",
};

function renderMutation<T>(hook: () => T) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return renderHook(hook, { wrapper });
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("useHideReview", () => {
	test("manda el token del motivo y el detalle en el cuerpo del PATCH", async () => {
		const calls = stubFetch(200, fila);
		const { result } = renderMutation(() => useHideReview());

		await result.current.mutateAsync({
			id: fila.id,
			moderation_reason: "insults_or_hate_speech",
			hidden_reason: "Lenguaje abusivo hacia el personal",
		});

		const call = calls[0];
		expect(call?.method).toBe("PATCH");
		expect(call?.url).toContain(`/reviews/moderation/${fila.id}/hide`);
		expect(JSON.parse(call?.body ?? "{}")).toEqual({
			moderation_reason: "insults_or_hate_speech",
			hidden_reason: "Lenguaje abusivo hacia el personal",
		});
	});

	test("una razón nombrada sin detalle viaja SIN hidden_reason", async () => {
		const calls = stubFetch(200, fila);
		const { result } = renderMutation(() => useHideReview());

		await result.current.mutateAsync({
			id: fila.id,
			moderation_reason: "threats_or_intimidation",
		});

		// El token ya dice por qué. Mandar `hidden_reason: ""` affirmaría que se
		// escribió una descripción que no existe.
		expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
			moderation_reason: "threats_or_intimidation",
		});
		expect(calls[0]?.body).not.toContain("hidden_reason");
	});

	test("un fallo se avisa con el requestId, no en silencio", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "a1b2c3d4e5f6",
		});
		const error = spyOn(toast, "error");
		const { result } = renderMutation(() => useHideReview());

		await result.current
			.mutateAsync({
				id: fila.id,
				moderation_reason: "insults_or_hate_speech",
			})
			.catch(() => undefined);

		// El toast sin el requestId deja al operador sin nada que darle a soporte.
		expect(error).toHaveBeenCalledWith(
			"Error interno del servidor · a1b2c3d4e5f6",
		);
	});

	test("un 400 de validación también sale, con su requestId", async () => {
		stubFetch(400, {
			statusCode: 400,
			message: "Validation failed",
			requestId: "badc0ffee1234",
		});
		const error = spyOn(toast, "error");
		const { result } = renderMutation(() => useHideReview());

		await result.current
			.mutateAsync({ id: fila.id, moderation_reason: "other" })
			.catch(() => undefined);

		// Traducido por la capa de la API, y con el requestId detrás del "·": sin
		// ese identificador el operador no tiene nada que correlacionar.
		expect(error).toHaveBeenCalledWith("La validación falló · badc0ffee1234");
	});
});

describe("useUnhideReview", () => {
	test("desocultar no manda cuerpo: es una transición, no un estado elegido", async () => {
		const calls = stubFetch(200, { ...fila, is_hidden: false });
		const { result } = renderMutation(() => useUnhideReview());

		await result.current.mutateAsync(fila.id);

		const call = calls[0];
		expect(call?.method).toBe("PATCH");
		expect(call?.url).toContain(`/reviews/moderation/${fila.id}/unhide`);
		expect(call?.body).toBeNull();
	});

	test("un fallo se avisa con el requestId", async () => {
		stubFetch(404, {
			statusCode: 404,
			message: `Reseña ${fila.id} no encontrada`,
			requestId: "feedface0000",
		});
		const error = spyOn(toast, "error");
		const { result } = renderMutation(() => useUnhideReview());

		await result.current.mutateAsync(fila.id).catch(() => undefined);

		// El mensaje llega en español y la capa de traducción no lo toca (su
		// regla es no reescribir lo que la API ya escribió en español), así que
		// lo que sale es literalmente lo que el servidor dijo.
		expect(error).toHaveBeenCalledWith(
			`Reseña ${fila.id} no encontrada · feedface0000`,
		);
	});
});
