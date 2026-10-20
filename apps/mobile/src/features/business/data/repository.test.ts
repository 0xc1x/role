import { describe, expect, jest, mock, test, type Mock } from "bun:test";

// El módulo real de supabase arranca timers que tocan window.localStorage.
const memstore = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window ??= {
	localStorage: {
		getItem: (k: string) => memstore.get(k) ?? null,
		setItem: (k: string, v: string) => void memstore.set(k, v),
		removeItem: (k: string) => void memstore.delete(k),
	},
};

mock.module("react-native", () => ({ Platform: { OS: "ios" } }));
mock.module("expo-file-system", () => ({ File: class {} }));
mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		rpc: jest.fn(),
	},
}));

// Dynamic imports: static imports evaluate before bare-specifier mocks
// (react-native) apply, which trips the Flow-parser on the real package.
const { supabase } = await import("@/src/core/supabase/client");
const { businessRepository, detectImageContentType } = await import(
	"@/src/features/business/data/repository"
);

const fromMock = supabase.from as unknown as Mock<
	(...args: never[]) => unknown
>;

/** Cadena PostgREST encadenable (thenable) para listados y head-counts. */
function mockChain(result: {
	data?: unknown;
	count?: number | null;
	error: unknown;
}) {
	const calls: Record<string, unknown[][]> = {};
	const selectArgs: unknown[][] = [];
	const chain = {} as Record<string, (...args: unknown[]) => unknown> & {
		then: unknown;
	};
	for (const m of ["eq", "ilike", "order", "range", "limit", "maybeSingle"]) {
		calls[m] = [];
		chain[m] = (...args: unknown[]) => {
			calls[m]?.push(args);
			return chain;
		};
	}
	// The repository awaits this chain and supabase-js `PostgrestBuilder`
	// exposes `then()`, so the double must be awaitable to stay faithful.
	// biome-ignore lint/suspicious/noThenProperty: intentional thenable double
	chain.then = (onF: unknown, onR: unknown) =>
		Promise.resolve(result).then(
			onF as (value: typeof result) => unknown,
			onR as (reason: unknown) => unknown,
		);
	(fromMock as Mock<(...args: never[]) => unknown>).mockReturnValue({
		select: (...args: unknown[]) => {
			selectArgs.push(args);
			return chain;
		},
	});
	return { calls, selectArgs };
}

/**
 * A table-aware PostgREST double.
 *
 * `mockChain` answers every table with the same body, which is fine for a
 * single-table read. `getBusinessesByOwnerId` reads TWO tables in order —the
 * memberships, then the businesses they resolve to— so the double has to
 * answer per table AND record which tables were asked, because the whole
 * point of the specs below is WHICH table the owner's panel reads.
 */
function mockTables(
	responses: Record<string, { data?: unknown; error?: unknown }>,
) {
	const tables: string[] = [];
	const calls: Record<string, Record<string, unknown[][]>> = {};
	const selects: Record<string, unknown[][]> = {};
	fromMock.mockReset();
	(fromMock as unknown as Mock<(table: string) => unknown>).mockImplementation(
		(table: string) => {
			tables.push(table);
			calls[table] ??= {};
			selects[table] ??= [];
			const answer = responses[table] ?? { data: [], error: null };
			const chain = {} as Record<string, (...args: unknown[]) => unknown> & {
				then: unknown;
			};
			for (const method of ["eq", "is", "in", "order", "limit"]) {
				calls[table][method] = [];
				chain[method] = (...args: unknown[]) => {
					calls[table][method]?.push(args);
					return chain;
				};
			}
			// biome-ignore lint/suspicious/noThenProperty: intentional thenable double
			chain.then = (onF: unknown, onR: unknown) =>
				Promise.resolve(answer).then(
					onF as (value: typeof answer) => unknown,
					onR as (reason: unknown) => unknown,
				);
			return {
				select: (...args: unknown[]) => {
					selects[table].push(args);
					return chain;
				},
			};
		},
	);
	return { tables, calls, selects };
}

/** A `businesses` row in the shape the owner's panel reads it. */
const businessRow = {
	id: "99999999-8888-7777-6666-555555555555",
	name: "Café del Valle",
	type: "restaurant",
	slug: "cafe-del-valle",
	image: null,
	cover_image: null,
	rating: null,
	review_count: null,
	description: null,
	phone: null,
	email: null,
	website: null,
	is_active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

describe("image upload validation", () => {
	test("detects supported image signatures and rejects arbitrary bytes", () => {
		const bytes = (...values: number[]) => new Uint8Array(values).buffer;
		expect(detectImageContentType(bytes(0xff, 0xd8, 0xff, 0x00))).toBe(
			"image/jpeg",
		);
		expect(
			detectImageContentType(
				bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
			),
		).toBe("image/png");
		expect(
			detectImageContentType(
				bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
			),
		).toBe("image/webp");
		expect(detectImageContentType(bytes(0, 1, 2, 3))).toBeNull();
	});
});

describe("businessRepository.createBusiness", () => {
	test("writes only owner-editable fields and uses the idempotent slug", async () => {
		const insert = jest.fn((_payload: Record<string, unknown>) => ({
			select: jest.fn(() => ({
				single: jest.fn(async () => ({ data: { id: "biz-1" }, error: null })),
			})),
		}));
		fromMock.mockReset();
		fromMock.mockReturnValue({ insert });

		await businessRepository.createBusiness({
			ownerId: "owner-1",
			name: "Owner Business",
			type: "restaurant",
			phone: null,
			email: "owner@example.com",
			description: null,
			website: null,
			logoUri: null,
			coverUri: null,
			hours: [],
			slug: "onboarding-owner-1",
		});

		const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload.slug).toBe("onboarding-owner-1");
		for (const protectedField of [
			"rating",
			"review_count",
			"commission_rate",
			"balance",
			"is_active",
			"verification_status",
			"verified_at",
			"verified_by",
			"rejection_reason",
		]) {
			expect(payload).not.toHaveProperty(protectedField);
		}
	});
});

describe("businessRepository paginated listing", () => {
	test("getBusinessReviews pagina con range y sin filtro de oferta", async () => {
		const { calls } = mockChain({ data: [], error: null });

		const rows = await businessRepository.getBusinessReviews("b1", {
			limit: 20,
			offset: 20,
		});

		expect(rows).toEqual([]);
		expect(calls.eq).toContainEqual(["business_id", "b1"]);
		expect(calls.order).toContainEqual(["created_at", { ascending: false }]);
		expect(calls.range).toContainEqual([20, 39]);
	});

	test("getBusinessReviews filtra por oferta via orders!inner", async () => {
		const { calls, selectArgs } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessReviews("b1", {
			offerId: "of1",
			limit: 3,
			offset: 0,
		});

		expect(String(selectArgs[0]?.[0])).toContain("!inner");
		expect(calls.eq).toContainEqual(["orders.offer_id", "of1"]);
		expect(calls.range).toContainEqual([0, 2]);
	});

	test("countBusinessReviews devuelve el head-count con head:true", async () => {
		const { selectArgs } = mockChain({ count: 5, error: null });

		const count = await businessRepository.countBusinessReviews("b1", {
			offerId: "of1",
		});

		expect(count).toBe(5);
		expect(selectArgs[0]?.[1]).toEqual({ count: "exact", head: true });
	});

	test("getBusinessOffers aplica sucursal + búsqueda server-side + range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessOffers("b1", {
			locationId: "loc1",
			search: "pan",
			limit: 20,
			offset: 0,
		});

		expect(calls.eq).toContainEqual(["business_id", "b1"]);
		expect(calls.eq).toContainEqual(["business_location_id", "loc1"]);
		expect(calls.ilike).toContainEqual(["title", "%pan%"]);
		expect(calls.range).toContainEqual([0, 19]);
	});

	test("countBusinessOffers filtra is_active con head:true", async () => {
		const { calls } = mockChain({ count: 4, error: null });

		const count = await businessRepository.countBusinessOffers("b1", {
			isActive: true,
		});

		expect(count).toBe(4);
		expect(calls.eq).toContainEqual(["is_active", true]);
	});

	test("getBusinessOffers filtra categoría server-side con !inner", async () => {
		const { calls, selectArgs } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessOffers("b1", {
			categoryId: "cat-9",
			orderBy: "title",
			ascending: true,
			limit: 20,
			offset: 0,
		});

		expect(String(selectArgs[0]?.[0])).toContain("offer_categories!inner");
		expect(calls.eq).toContainEqual(["offer_categories.category_id", "cat-9"]);
		expect(calls.order).toContainEqual(["title", { ascending: true }]);
		expect(calls.range).toContainEqual([0, 19]);
	});

	test("countBusinessOffers incluye el embed para el filtro de categoría", async () => {
		const { calls, selectArgs } = mockChain({ count: 2, error: null });

		const count = await businessRepository.countBusinessOffers("b1", {
			categoryId: "cat-9",
		});

		expect(count).toBe(2);
		expect(String(selectArgs[0]?.[0])).toContain("offer_categories!inner");
		expect(calls.eq).toContainEqual(["offer_categories.category_id", "cat-9"]);
	});

	test("getCoupons filtra is_active y pagina con range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getCoupons("b1", {
			isActive: true,
			limit: 20,
			offset: 20,
		});

		expect(calls.eq).toContainEqual(["is_active", true]);
		expect(calls.range).toContainEqual([20, 39]);
	});

	test("countCoupons devuelve el head-count", async () => {
		mockChain({ count: 2, error: null });

		await expect(businessRepository.countCoupons("b1")).resolves.toBe(2);
	});

	test("getPayouts filtra por status y pagina con range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getPayouts("b1", {
			status: "paid",
			limit: 20,
			offset: 0,
		});

		expect(calls.eq).toContainEqual(["status", "paid"]);
		expect(calls.order).toContainEqual(["period_end", { ascending: false }]);
		expect(calls.range).toContainEqual([0, 19]);
	});

	test("getPayout lee una sola fila por id", async () => {
		mockChain({ data: null, error: null });

		await expect(businessRepository.getPayout("p1")).resolves.toBeNull();
		expect(fromMock).toHaveBeenCalledWith("payouts");
	});

	test("getPayoutTotals suma exacto por estado (sin filtro)", async () => {
		const { calls } = mockChain({
			data: [
				{ net_amount: 100, status: "paid" },
				{ net_amount: 50, status: "paid" },
				{ net_amount: 30, status: "processing" },
				{ net_amount: 10, status: "failed" },
			],
			error: null,
		});

		await expect(businessRepository.getPayoutTotals("b1")).resolves.toEqual({
			paid: 150,
			paidCount: 2,
			pending: 30,
		});
		expect(calls.eq).toContainEqual(["business_id", "b1"]);
		expect(calls.limit).toContainEqual([1000]);
	});
});

describe("businessRepository.getBusinessesByOwnerId", () => {
	test("los negocios del dueño salen de sus membresías de dueño, no de business_ownership", async () => {
		// The owner's panel resolves its businesses through the MEMBERSHIP
		// model: the owner IS a live `business_members` row. Reading the legacy
		// ownership table instead is the regression this pins down, so the
		// assertion is about the TABLE, not about the data that came back.
		const { tables, calls } = mockTables({
			business_members: {
				data: [{ business_id: businessRow.id }],
				error: null,
			},
			businesses: { data: [businessRow], error: null },
		});

		const businesses =
			await businessRepository.getBusinessesByOwnerId("owner-1");

		expect(tables).toEqual(["business_members", "businesses"]);
		expect(tables).not.toContain("business_ownership");

		// The membership read is scoped to THIS user and to the LIVE owner
		// rows: role, status and deleted_at are the same three halves the
		// database's own `business_member_role()` uses to decide that somebody
		// IS the owner. The RLS repeats the tenancy (`user_id = auth.uid()`),
		// so a caller passing somebody else's id reads nothing.
		expect(calls.business_members.eq).toContainEqual(["user_id", "owner-1"]);
		expect(calls.business_members.eq).toContainEqual(["role", "owner"]);
		expect(calls.business_members.eq).toContainEqual(["status", "active"]);
		expect(calls.business_members.is).toContainEqual(["deleted_at", null]);

		// And the businesses come from the ids those memberships resolved.
		expect(calls.businesses.in).toContainEqual(["id", [businessRow.id]]);
		expect(businesses).toHaveLength(1);
		expect(businesses[0]?.id).toBe(businessRow.id);
	});

	test("un dueño que además tiene acceso de personal en el mismo negocio lo lista una sola vez", async () => {
		// Two rows for the same business: the owner's own membership and a
		// staff one. The panel lists a business ONCE — the id list is
		// deduplicated before it asks for the businesses, so a membership read
		// that answers with the same business twice cannot render it twice.
		const { calls } = mockTables({
			business_members: {
				data: [
					{ business_id: "biz-1", role: "owner", status: "active" },
					{ business_id: "biz-1", role: "staff", status: "active" },
				],
				error: null,
			},
			businesses: { data: [businessRow], error: null },
		});

		await businessRepository.getBusinessesByOwnerId("owner-1");

		const idCall = calls.businesses.in.find((args) => args[0] === "id");
		expect(idCall?.[1]).toEqual(["biz-1"]);
	});

	test("sin membresías de dueño no se pregunta por negocios", async () => {
		// The empty branch is the app's "you have no business" state, and it
		// is a state the e2e asserts on the screen. Reaching for `businesses`
		// with an empty id list would be a query that can only answer empty.
		const { tables } = mockTables({
			business_members: { data: [], error: null },
		});

		await expect(
			businessRepository.getBusinessesByOwnerId("owner-1"),
		).resolves.toEqual([]);
		expect(tables).toEqual(["business_members"]);
	});
});
