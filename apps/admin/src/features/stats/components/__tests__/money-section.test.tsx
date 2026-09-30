import { afterEach, describe, expect, test } from "bun:test";
import { PLATFORM_CURRENCY } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * La sección de dinero del panel responde a la pregunta que el back office no
 * podía responder: "¿estamos ganando dinero?". Su riesgo no es mostrar poco, es
 * mostrar DOS números distintos como si fueran uno.
 *
 * `accrued` y `collected` salen de tablas distintas y de ejes distintos
 * (`orders.created_at` vs `payouts.paid_at`): que no coincidan es información, no
 * un error de cálculo. Estos tests fijan que cada cara se muestra con SU cifra,
 * con SU rótulo, y que ninguna hereda el número de la otra.
 */
const { MoneySection } = await import("../money-section");
const { defaultRevenuePeriod } = await import("../../lib/revenue-period");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

/** Rótulo esperado según la moneda del CONTRATO, no según el del panel. */
function money(amount: number): string {
	return new Intl.NumberFormat("es-EC", {
		style: "currency",
		currency: PLATFORM_CURRENCY,
		currencyDisplay: "code",
	}).format(amount);
}

/**
 * Matcher de texto para un importe.
 *
 * Hace falta porque `getByText` con un string exacto normaliza SOLO el texto del
 * nodo, nunca el matcher: ICU separa el código de moneda con U+00A0 y la
 * normalización de testing-library lo convierte en espacio normal, así que un
 * matcher con el NBSP crudo nunca iguala. Un matcher de función recibe el texto ya
 * normalizado, que es lo que hay que comparar.
 */
function moneyText(amount: number) {
	const expected = money(amount).replace(/\u00a0/g, " ");
	return (content: string) => content === expected;
}

// Montos deliberadamente distintos entre las dos caras: si la UI mezclara
// accrued y collected, "USD 150,00" y "USD 50,00" no podrían aparecer ambos.
const revenue = {
	period: { from: "2026-09-01", to: "2026-09-30" },
	accrued: {
		gross_amount: 150,
		platform_fees: 20,
		business_net: 130,
		effective_commission_rate: 0.1333,
		orders: { total: 4, completed: 2, cancelled: 1, expired: 1 },
	},
	collected: {
		gross_amount: 50,
		platform_fees: 10,
		business_net: 40,
		paid_payouts: 1,
		outstanding_business_net: 90,
		outstanding_payouts: 1,
		failed_payouts: 1,
	},
};

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function stubFetch(status: number, body: unknown) {
	fetchCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		fetchCalls.push(String(input));
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function revenueCalls() {
	return fetchCalls.filter((url) => url.includes("/stats/revenue"));
}

function renderSection() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MoneySection />
		</QueryClientProvider>,
	);
}

/** La tarjeta que contiene un encabezado, para acotar las aserciones a una cara. */
function cardTitled(title: string): HTMLElement {
	const heading = screen.getByText(title);
	const card = heading.closest("[data-slot='card']");
	if (!card) throw new Error(`no se encontró la tarjeta de "${title}"`);
	return card as HTMLElement;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("sección de dinero — devengado vs cobrado", () => {
	test("cada cara muestra SUS cifras, no las de la otra", async () => {
		stubFetch(200, revenue);
		renderSection();

		const accrued = await screen.findByText("Devengado");
		expect(accrued).toBeDefined();
		const collected = screen.getByText("Cobrado");

		const devengado = cardTitled("Devengado");
		const cobrado = cardTitled("Cobrado");

		// Lo devengado muestra el bruto de órdenes (150), no el de cortes (50).
		expect(devengado.textContent).toContain(money(150));
		expect(devengado.textContent).not.toContain(money(50));
		// Y lo cobrado muestra 50, no 150. Las dos caras no comparten cifras.
		expect(cobrado.textContent).toContain(money(50));
		expect(cobrado.textContent).not.toContain(money(150));

		expect(collected).toBeDefined();
	});

	test("los rótulos nombran la operación, no dos ingresos genéricos", async () => {
		stubFetch(200, revenue);
		renderSection();

		await screen.findByText("Devengado");

		// El defecto: dos tarjetas tituladas "Ingresos" con cifras distintas. El
		// operador las lee como la misma magnitud medida dos veces.
		const devengado = cardTitled("Devengado");
		const cobrado = cardTitled("Cobrado");
		expect(devengado.textContent).toContain("Ganado por órdenes completadas");
		expect(devengado.textContent).toContain("Todavía no es");
		expect(cobrado.textContent).toContain("Dinero que salió de la plataforma");
		expect(cobrado.textContent).toContain("fecha del pago");

		// Y el rótulo de la ganancia de cada cara es distinto y no compartido.
		expect(devengado.textContent).toContain("Ingreso de la plataforma");
		expect(cobrado.textContent).toContain("Comisión cobrada");
		expect(screen.queryAllByText("Ingresos")).toHaveLength(0);
	});

	test("dice explícitamente que las dos caras no se suman", async () => {
		stubFetch(200, revenue);
		renderSection();

		await screen.findByText("Devengado");

		expect(screen.getByText(/Devengado y cobrado no se suman/)).toBeDefined();
	});

	// El periodo efectivo se muestra desde `period` de la RESPUESTA, no desde lo
	// que el operador tecleó: si el servidor resolviera otra ventana, la pantalla
	// lo diría en vez de mentir con los inputs.
	test("muestra el período que resolvió la API", async () => {
		stubFetch(200, revenue);
		renderSection();

		await screen.findByText("Devengado");
		expect(screen.getByText(/2026-09-01 → 2026-09-30/)).toBeDefined();
	});
});

describe("sección de dinero — unidad", () => {
	test("cada importe lleva el código de la moneda de la plataforma", async () => {
		stubFetch(200, revenue);
		renderSection();

		await screen.findByText("Devengado");

		// Los siete importes del reporte, cada uno rotulado desde el contrato.
		for (const amount of [150, 20, 130, 50, 10, 40, 90]) {
			expect(screen.getByText(moneyText(amount))).toBeDefined();
		}
		// Un "$" a secas no distinguiría USD de MXN: el rótulo tiene que decir la
		// unidad en la propia cifra, no dejarla implícita en el símbolo.
		const bareSymbol = new Intl.NumberFormat("es-EC", {
			style: "currency",
			currency: PLATFORM_CURRENCY,
		}).format(150);
		expect(bareSymbol).not.toBe(money(150));
		expect(document.body.textContent).not.toContain(bareSymbol);
	});

	test("los conteos NO se formatean como dinero", async () => {
		stubFetch(200, revenue);
		renderSection();

		await screen.findByText("Devengado");

		// "Órdenes creadas" vale 4: un conteo con "USD 4,00" al frente sería tan
		// engañoso como un importe sin unidad.
		const devengado = cardTitled("Devengado");
		const label = screen.getByText("Órdenes creadas");
		const row = label.parentElement;
		expect(row?.textContent).toContain("4");
		expect(row?.textContent).not.toContain(PLATFORM_CURRENCY);
		expect(devengado.textContent).not.toContain(money(4));
	});
});

describe("sección de dinero — período", () => {
	test("el período por defecto son los últimos 30 días contando hoy, en UTC", () => {
		const period = defaultRevenuePeriod(new Date("2026-09-26T18:00:00.000Z"));

		expect(period).toEqual({ from: "2026-08-28", to: "2026-09-26" });
	});

	test("el período viaja en la request con from y to", async () => {
		stubFetch(200, revenue);
		renderSection();

		await waitFor(() => expect(revenueCalls()).toHaveLength(1));
		const url = revenueCalls()[0] ?? "";
		expect(url).toContain("from=");
		expect(url).toContain("to=");
	});

	test("cambiar las fechas vuelve a pedir el reporte con la ventana nueva", async () => {
		stubFetch(200, revenue);
		renderSection();

		await waitFor(() => expect(revenueCalls()).toHaveLength(1));

		fireEvent.change(await screen.findByLabelText("Desde"), {
			target: { value: "2026-07-01" },
		});
		fireEvent.change(await screen.findByLabelText("Hasta"), {
			target: { value: "2026-07-31" },
		});

		await waitFor(() => expect(revenueCalls().length).toBeGreaterThan(1));
		const last = revenueCalls().at(-1) ?? "";
		expect(last).toContain("from=2026-07-01");
		expect(last).toContain("to=2026-07-31");
	});
});

describe("sección de dinero — query caída", () => {
	// El `requestId` es lo único que soporte puede cruzar con el log del servidor.
	test("el fallo muestra el mensaje de la API con su requestId", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "9c1d2e3f-4411",
		});
		renderSection();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · 9c1d2e3f-4411"),
			).toBeDefined(),
		);
	});

	// El mismo motivo por el que el resto del panel no fabrica ceros: "USD 0,00"
	// con la API caída se lee como "no ganamos nada" y el operador no actúa.
	test("no fabrica ceros cuando la query falla", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "9c1d2e3f-4411",
		});
		renderSection();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · 9c1d2e3f-4411"),
			).toBeDefined(),
		);
		expect(screen.queryByText(moneyText(0))).toBeNull();
		expect(screen.queryByText("Devengado")).toBeNull();
	});

	test("ofrece reintentar cuando la query falla", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "9c1d2e3f-4411",
		});
		renderSection();

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = revenueCalls().length;
		fireEvent.click(retry);

		await waitFor(() => expect(revenueCalls().length).toBeGreaterThan(before));
	});
});
