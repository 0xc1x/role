import { describe, expect, mock, test } from "bun:test";

import { strings } from "@/src/core/i18n/strings";

// The real supabase module starts timers that touch window.localStorage.
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
// Stand-in for the picked file: a minimal JPEG signature so
// detectImageContentType accepts it and the upload path is exercised.
mock.module("expo-file-system", () => ({
	File: class {
		async arrayBuffer() {
			return new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10]).buffer;
		}
	},
}));

const insertPayloads: Record<string, unknown>[] = [];
const updatePayloads: Record<string, unknown>[] = [];
let uploadError: unknown = null;
const uploadedPaths: string[] = [];

const STORED_IMAGE = "https://cdn.role.app/owner-1/products/biz-1_old.jpg";

/** Minimal row shaped like the `OFFER_SELECT` projection of a saved offer. */
function offerRow(image: string | null) {
	return {
		id: "of-1",
		business_id: "biz-1",
		business_location_id: "loc-1",
		title: "Mañana",
		description: null,
		image,
		original_price: 10,
		discounted_price: 4,
		stock: 5,
		initial_stock: 5,
		pickup_start: "2026-09-25T18:00:00.000Z",
		pickup_end: "2026-09-25T22:00:00.000Z",
		is_active: true,
		includes: null,
		allergens: null,
		rating: 0,
		review_count: 0,
		created_at: "2026-09-25T00:00:00.000Z",
		businesses: { id: "biz-1", name: "Panadería", type: "bakery" },
		business_locations: null,
		offer_categories: [],
	};
}

const from = (table: string) => {
	if (table === "offers") {
		return {
			insert: (payload: Record<string, unknown>) => {
				insertPayloads.push(payload);
				return {
					select: () => ({
						single: async () => ({
							data: offerRow((payload.image as string) ?? null),
							error: null,
						}),
					}),
				};
			},
			update: (payload: Record<string, unknown>) => {
				updatePayloads.push(payload);
				const chain = {
					eq: () => chain,
					select: () => ({
						single: async () => ({
							// PostgREST echoes the stored row: the image column
							// only changes if the payload carried one.
							data: offerRow(
								(payload.image as string | undefined) ?? STORED_IMAGE,
							),
							error: null,
						}),
					}),
				};
				return chain;
			},
		};
	}
	// offer_categories (syncCategories): delete().eq() is awaited.
	const categoriesChain = {
		eq: () => categoriesChain,
		then: (onFulfilled: (value: unknown) => unknown) =>
			Promise.resolve({ error: null, data: null }).then(onFulfilled),
	};
	return { delete: () => categoriesChain, insert: () => categoriesChain };
};

mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from,
		rpc: async () => ({ data: null, error: null }),
		auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
		storage: {
			from: () => ({
				upload: async (path: string, _bytes: ArrayBuffer) => {
					uploadedPaths.push(path);
					return { error: uploadError };
				},
				getPublicUrl: (path: string) => ({
					data: { publicUrl: `https://cdn.role.app/${path}` },
				}),
			}),
		},
	},
}));

const { saveOffer } = await import("@/src/features/business/data/repository");

const baseInput = {
	businessId: "biz-1",
	businessLocationId: "loc-1",
	title: "Mañana",
	description: null,
	includes: null,
	allergens: null,
	originalPrice: 10,
	discountedPrice: 4,
	stock: 5,
	initialStock: 5,
	pickupStart: "2026-09-25T18:00:00.000Z",
	pickupEnd: "2026-09-25T22:00:00.000Z",
	isActive: true,
	categories: [],
};

const STORAGE_DENIAL = {
	code: "42501",
	message: "new row violates row-level security policy",
	details: null,
	hint: null,
};

describe("saveOffer image upload", () => {
	test("insert: a failed upload surfaces as a validation error and publishes nothing", async () => {
		insertPayloads.length = 0;
		uploadError = STORAGE_DENIAL;

		const attempt = saveOffer(
			{ ...baseInput, imageUri: "file://new.jpg" },
			true,
		);

		await expect(attempt).rejects.toThrow(strings.business.photoUploadFailed);
		expect(insertPayloads).toHaveLength(0);
		await attempt.catch((error: unknown) => {
			const failure = error as {
				kind: string;
				message: string;
				context?: { cause?: unknown };
			};
			expect(failure.kind).toBe("validation");
			// The storage cause survives for logs, without reaching the copy.
			expect(failure.context?.cause as object | undefined).toBe(
				STORAGE_DENIAL as object,
			);
			expect(failure.message).not.toMatch(/row-level security/i);
		});
		uploadError = null;
	});

	test("insert: a failed upload beats a no-photo insert even without requireImage", async () => {
		insertPayloads.length = 0;
		uploadError = STORAGE_DENIAL;

		await expect(
			saveOffer({ ...baseInput, imageUri: "file://new.jpg" }, false),
		).rejects.toThrow(strings.business.photoUploadFailed);
		expect(insertPayloads).toHaveLength(0);
		uploadError = null;
	});

	test("insert: with a working upload the offer carries the public image", async () => {
		insertPayloads.length = 0;
		uploadedPaths.length = 0;
		uploadError = null;

		const result = await saveOffer(
			{ ...baseInput, imageUri: "file://new.jpg" },
			true,
		);

		expect(result.imageUploadFailed).toBe(false);
		expect(insertPayloads).toHaveLength(1);
		expect(insertPayloads[0]?.image as string).toMatch(
			/^https:\/\/cdn\.role\.app\/owner-1\/products\/biz-1_\d+\.jpg$/,
		);
		expect(result.offer.offer.image).toBe(insertPayloads[0]?.image as string);
	});

	test("insert: without a photo the insert is refused before any write", async () => {
		insertPayloads.length = 0;

		await expect(
			saveOffer({ ...baseInput, imageUri: null }, true),
		).rejects.toThrow(strings.business.photoRequired);
		expect(insertPayloads).toHaveLength(0);
	});

	test("update: a failed upload warns and keeps the stored image", async () => {
		updatePayloads.length = 0;
		uploadError = STORAGE_DENIAL;

		const result = await saveOffer(
			{ ...baseInput, id: "of-1", imageUri: "file://new.jpg" },
			false,
		);

		expect(result.imageUploadFailed).toBe(true);
		// The rest of the edit applied…
		expect(updatePayloads).toHaveLength(1);
		expect(updatePayloads[0]?.title).toBe("Mañana");
		// …and the image column was never blanked or overwritten.
		expect(updatePayloads[0]).not.toHaveProperty("image");
		expect(result.offer.offer.image).toBe(STORED_IMAGE);
		uploadError = null;
	});

	test("update: a working upload replaces the image and warns nothing", async () => {
		updatePayloads.length = 0;
		uploadError = null;

		const result = await saveOffer(
			{ ...baseInput, id: "of-1", imageUri: "file://new.jpg" },
			false,
		);

		expect(result.imageUploadFailed).toBe(false);
		expect(updatePayloads[0]?.image).toMatch(
			/^https:\/\/cdn\.role\.app\/owner-1\/products\/biz-1_\d+\.jpg$/,
		);
	});

	test("update: leaving the photo alone never uploads", async () => {
		updatePayloads.length = 0;
		uploadedPaths.length = 0;

		const result = await saveOffer(
			{ ...baseInput, id: "of-1", imageUri: null },
			false,
		);

		expect(uploadedPaths).toHaveLength(0);
		expect(updatePayloads[0]).not.toHaveProperty("image");
		expect(result.imageUploadFailed).toBe(false);
	});
});
