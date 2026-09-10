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

mock.module("@/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		rpc: jest.fn(),
	},
}));

import { supabase } from "@/core/supabase/client";
import {
	expiringSoonWindowHours,
	offersRepository,
} from "@/features/offers/data/repository";

const rpcMock = supabase.rpc as unknown as Mock<
	(...args: never[]) => Promise<{ data: unknown; error: unknown }>
>;

function rpcOk(data: unknown) {
	rpcMock.mockImplementation(async () => ({ data, error: null }));
}

function rpcError() {
	rpcMock.mockImplementation(async () => ({
		data: null,
		error: { code: "XX000", message: "boom" },
	}));
}

/** Fila con el shape que devuelve active_offers_near (embeds jsonb). */
function offerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "offer-1",
		business_id: "biz-1",
		business_location_id: "loc-1",
		title: "Pan del día",
		description: "Pan artesanal",
		image: null,
		original_price: 100,
		discounted_price: 30,
		stock: 5,
		initial_stock: 10,
		pickup_start: "2026-09-05T17:00:00Z",
		pickup_end: "2026-09-05T20:00:00Z",
		is_active: true,
		includes: null,
		allergens: null,
		rating: 4.5,
		review_count: 3,
		created_at: "2026-09-04T10:00:00Z",
		businesses: {
			id: "biz-1",
			name: "Panadería",
			type: "bakery",
			image: null,
			rating: 4.5,
			review_count: 3,
		},
		business_locations: {
			id: "loc-1",
			name: "Sucursal",
			address: "Calle 1",
			latitude: -0.24,
			longitude: -79.19,
			zone: "Centro",
		},
		offer_categories: [
			{
				categories: {
					id: "cat-1",
					name: "Panadería",
					slug: "panaderia",
					emoji: "🥐",
					image_url: null,
					active: true,
				},
			},
		],
		distance_km: 1.23,
		...overrides,
	};
}

/** Fila con el shape que devuelve active_businesses_near. */
function businessRow(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "biz-1",
		name: "Panadería",
		type: "bakery",
		image: null,
		rating: 4.5,
		review_count: 3,
		business_location_id: "loc-1",
		address: "Calle 1",
		latitude: -0.24,
		longitude: -79.19,
		zone: "Centro",
		active_deals_count: 4,
		distance_km: 0.8,
		...overrides,
	};
}

const point = { lat: -0.2387, lng: -79.1958, radiusKm: 5 };

describe("offersRepository (RPC activo)", () => {
	test("getPopularOrders llama active_offers_near con geo, sort y limit", async () => {
		rpcOk([offerRow()]);
		const offers = await offersRepository.getPopularOffers(point, 10);
		expect(rpcMock).toHaveBeenCalledWith("active_offers_near", {
			p_lat: point.lat,
			p_lng: point.lng,
			p_radius_km: point.radiusKm,
			p_category_id: null,
			p_sort: "created_at",
			p_expiring_within_hours: null,
			p_max_price: null,
			p_search: null,
			p_limit: 10,
			p_offset: 0,
		});
		expect(offers).toHaveLength(1);
		expect(offers[0].offer.id).toBe("offer-1");
		expect(offers[0].business.name).toBe("Panadería");
		expect(offers[0].location?.zone).toBe("Centro");
		expect(offers[0].categories).toHaveLength(1);
	});

	test("sin punto de referencia manda nulls (fallback global)", async () => {
		rpcOk([]);
		await offersRepository.getRecentOffers(undefined, 5);
		expect(rpcMock).toHaveBeenCalledWith("active_offers_near", {
			p_lat: null,
			p_lng: null,
			p_radius_km: null,
			p_category_id: null,
			p_sort: "created_at",
			p_expiring_within_hours: null,
			p_max_price: null,
			p_search: null,
			p_limit: 5,
			p_offset: 0,
		});
	});

	test("getExpiringSoonOffers usa ventana de expiración y sort pickup_end", async () => {
		rpcOk([]);
		await offersRepository.getExpiringSoonOffers(point, 5);
		expect(rpcMock).toHaveBeenCalledWith(
			"active_offers_near",
			expect.objectContaining({
				p_sort: "pickup_end",
				p_expiring_within_hours: expiringSoonWindowHours,
				p_lat: point.lat,
			}),
		);
	});

	test("getNearbyOffers ordena por distancia con radio default 5", async () => {
		rpcOk([]);
		await offersRepository.getNearbyOffers({ lat: 1, lng: 2 });
		expect(rpcMock).toHaveBeenCalledWith(
			"active_offers_near",
			expect.objectContaining({
				p_sort: "distance",
				p_radius_km: 5,
				p_limit: 20,
			}),
		);
	});

	test("getFilteredOffers delega filtros y paginación a la DB", async () => {
		rpcOk([]);
		await offersRepository.getFilteredOffers({
			lat: 1,
			lng: 2,
			category: "cat-9",
			maxPrice: 50,
			maxDistanceKm: 3,
			searchQuery: "pan",
			page: 2,
			limit: 20,
		});
		expect(rpcMock).toHaveBeenCalledWith("active_offers_near", {
			p_lat: 1,
			p_lng: 2,
			p_radius_km: 3,
			p_category_id: "cat-9",
			p_sort: "created_at",
			p_expiring_within_hours: null,
			p_max_price: 50,
			p_search: "pan",
			p_limit: 20,
			p_offset: 40,
		});
	});

	test("getFilteredOffers sin distancia no manda radio", async () => {
		rpcOk([]);
		await offersRepository.getFilteredOffers({ searchQuery: "tacos" });
		expect(rpcMock).toHaveBeenCalledWith(
			"active_offers_near",
			expect.objectContaining({
				p_lat: null,
				p_lng: null,
				p_radius_km: null,
				p_search: "tacos",
			}),
		);
	});

	test("getAllBusinesses mapea summary y pagina server-side", async () => {
		rpcOk([businessRow()]);
		const biz = await offersRepository.getAllBusinesses({
			lat: 1,
			lng: 2,
			radiusKm: 10,
			searchQuery: "pan",
			limit: 50,
			page: 1,
		});
		expect(rpcMock).toHaveBeenCalledWith("active_businesses_near", {
			p_lat: 1,
			p_lng: 2,
			p_radius_km: 10,
			p_search: "pan",
			p_type: null,
			p_sort: "deals",
			p_limit: 50,
			p_offset: 50,
		});
		expect(biz).toHaveLength(1);
		expect(biz[0]).toMatchObject({
			id: "biz-1",
			name: "Panadería",
			type: "bakery",
			activeDealsCount: 4,
			distanceKm: 0.8,
			zone: "Centro",
			businessLocationId: "loc-1",
		});
	});

	test("getNearbyBusinesses ordena por distancia", async () => {
		rpcOk([]);
		await offersRepository.getNearbyBusinesses(point, 5);
		expect(rpcMock).toHaveBeenCalledWith(
			"active_businesses_near",
			expect.objectContaining({ p_sort: "distance", p_limit: 5 }),
		);
	});

	test("propaga el error del rpc", async () => {
		rpcError();
		await expect(
			offersRepository.getPopularOffers(point, 10),
		).rejects.toThrow("boom");
	});
});

describe("agregaciones server-side (RPC)", () => {
	test("getCategoryStats mapea counts y ordena desc", async () => {
		rpcOk([
			{ id: "cat-1", name: "Panadería", slug: "panaderia", emoji: "🥐", image_url: "u1", active: true, active_count: 3 },
			{ id: "cat-2", name: "Café", slug: "cafe", emoji: "☕", image_url: "u2", active: true, active_count: 7 },
		]);
		const stats = await offersRepository.getCategoryStats();
		expect(rpcMock).toHaveBeenCalledWith("active_offer_category_counts");
		expect(stats.map((s) => s.id)).toEqual(["cat-2", "cat-1"]);
		expect(stats[0]).toMatchObject({ name: "Café", count: 7, emoji: "☕", imageUrl: "u2" });
	});

	test("getPopularAreas pasa el punto y radio al rpc", async () => {
		rpcOk([{ zone: "Centro", deals: 4 }]);
		const areas = await offersRepository.getPopularAreas({
			lat: 1,
			lng: 2,
			radiusKm: 8,
		});
		expect(rpcMock).toHaveBeenCalledWith("popular_zones", {
			p_lat: 1,
			p_lng: 2,
			p_radius_km: 8,
			p_limit: 5,
		});
		expect(areas).toEqual([{ name: "Centro", deals: 4 }]);
	});

	test("getPopularAreas sin punto devuelve top global", async () => {
		rpcOk([{ zone: "Norte", deals: 9 }]);
		const areas = await offersRepository.getPopularAreas();
		expect(rpcMock).toHaveBeenCalledWith("popular_zones", {
			p_lat: null,
			p_lng: null,
			p_radius_km: 5,
			p_limit: 5,
		});
		expect(areas).toEqual([{ name: "Norte", deals: 9 }]);
	});

	test("getPopularAreas tolera errores devolviendo []", async () => {
		rpcError();
		await expect(offersRepository.getPopularAreas()).resolves.toEqual([]);
	});
});
