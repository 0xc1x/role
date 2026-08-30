import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/features/auth/store";
import { offersRepository } from "@/features/offers/data/repository";
import { favoritesRepository } from "@/features/favorites/data/repository";
import { orderRepository } from "@/features/orders/data/repository";
import {
	useSavedAddresses,
	usePreferences,
} from "@/features/profile/hooks";

// ─── Offers ─────────────────────────────────────────────────────────
export function useActiveOffers(categoryId?: string | null) {
	return useQuery({
		queryKey: ["offers", "active", categoryId ?? "all"],
		queryFn: () => offersRepository.getAllActiveOffers(categoryId ?? null),
	});
}

export function useOffer(id: string) {
	return useQuery({
		queryKey: ["offers", id],
		queryFn: () => offersRepository.getOfferById(id),
		enabled: id.length > 0,
	});
}

export function usePopularOffers(limit = 10, category?: string | null) {
	return useQuery({
		queryKey: ["offers", "popular", category ?? "all"],
		queryFn: () =>
			category
				? offersRepository.getPopularOffersFiltered(category, limit)
				: offersRepository.getPopularOffers(limit),
	});
}

export function useExpiringSoonOffers(limit = 5) {
	return useQuery({
		queryKey: ["offers", "expiring"],
		queryFn: () => offersRepository.getExpiringSoonOffers(undefined, limit),
	});
}

export function useCategories() {
	return useQuery({
		queryKey: ["categories"],
		queryFn: offersRepository.getCategories,
	});
}

export function useNearbyOffers(lat: number, lng: number, radiusKm: number) {
	return useQuery({
		queryKey: ["offers", "nearby", lat, lng, radiusKm],
		queryFn: () => offersRepository.getNearbyOffers({ lat, lng, radiusKm }),
		enabled: lat != null && lng != null,
	});
}

export function useAllBusinesses(
	lat?: number | null,
	lng?: number | null,
	searchQuery?: string | null,
	type?: string | null,
) {
	return useQuery({
		queryKey: ["businesses", "all", { lat, lng, searchQuery, type }],
		queryFn: () =>
			offersRepository.getAllBusinesses({
				lat,
				lng,
				radiusKm: 10,
				searchQuery,
				type,
				limit: 50,
			}),
	});
}

export function useFilteredOffers(filters: {
	category?: string | null;
	maxPrice?: number | null;
	maxDistanceKm?: number | null;
	lat?: number;
	lng?: number;
	searchQuery?: string | null;
}) {
	return useQuery({
		queryKey: ["offers", "filtered", filters],
		queryFn: () => offersRepository.getFilteredOffers(filters),
	});
}

const PAGE_SIZE = 20;

export function useFilteredOffersInfinite(filters: {
	category?: string | null;
	maxPrice?: number | null;
	maxDistanceKm?: number | null;
	lat?: number;
	lng?: number;
	searchQuery?: string | null;
}) {
	return useInfiniteQuery({
		queryKey: ["offers", "filtered", "infinite", filters],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			offersRepository.getFilteredOffers({ ...filters, page: pageParam as number, limit: PAGE_SIZE }),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
	});
}

export function useAllBusinessesInfinite(
	lat?: number | null,
	lng?: number | null,
	searchQuery?: string | null,
	type?: string | null,
) {
	return useInfiniteQuery({
		queryKey: ["businesses", "all", "infinite", { lat, lng, searchQuery, type }],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			offersRepository.getAllBusinesses({
				lat,
				lng,
				radiusKm: 10,
				searchQuery,
				type,
				limit: PAGE_SIZE,
				page: pageParam as number,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
	});
}

// ─── Home screen hooks ────────────────────────────────────────────
export function useCategoryStats() {
	return useQuery({
		queryKey: ["categories", "stats"],
		queryFn: () => offersRepository.getCategoryStats(),
	});
}

export function usePopularAreas() {
	const profile = useAuthStore((s) => s.profile);
	const { data: preferences } = usePreferences(profile?.id ?? "");
	const address = useSelectedAddress();
	const lat = address?.latitude;
	const lng = address?.longitude;
	const radiusKm = preferences?.notification_radius_km ?? 5;
	return useQuery({
		queryKey: ["areas", "popular", lat, lng, radiusKm],
		queryFn: () =>
			offersRepository.getPopularAreas(
				lat != null && lng != null ? { lat, lng, radiusKm } : undefined,
			),
	});
}

export function useRecentOffers(limit = 5) {
	return useQuery({
		queryKey: ["offers", "recent", limit],
		queryFn: () => offersRepository.getRecentOffers(undefined, limit),
	});
}

export function useNearbyBusinesses(limit = 5) {
	const profile = useAuthStore((s) => s.profile);
	const { data: preferences } = usePreferences(profile?.id ?? "");
	const address = useSelectedAddress();
	const lat = address?.latitude;
	const lng = address?.longitude;
	const radiusKm = preferences?.notification_radius_km ?? 5;
	return useQuery({
		queryKey: ["businesses", "nearby", limit, lat, lng, radiusKm],
		queryFn: () =>
			offersRepository.getNearbyBusinesses(
				lat != null && lng != null ? { lat, lng, radiusKm } : undefined,
				limit,
			),
	});
}

export function useSelectedAddress() {
	const profile = useAuthStore((s) => s.profile);
	const { data: addresses } = useSavedAddresses(profile?.id ?? "");
	return addresses?.find((a) => a.is_default);
}

export function useNearbyOffersHook(limit = 10, category?: string | null) {
	const selectedAddress = useSelectedAddress();
	return useQuery({
		queryKey: [
			"offers",
			"nearby",
			selectedAddress?.latitude,
			selectedAddress?.longitude,
			limit,
			category ?? "all",
		],
		queryFn: () =>
			offersRepository.getNearbyOffers({
				lat: selectedAddress?.latitude ?? 0,
				lng: selectedAddress?.longitude ?? 0,
				radiusKm: 5,
				limit,
				category: category ?? null,
			}),
		enabled: !!selectedAddress?.latitude && !!selectedAddress?.longitude,
	});
}

// ─── Favorites ──────────────────────────────────────────────────────
export function useFavorites() {
	const profile = useAuthStore((s) => s.profile);
	return useQuery({
		queryKey: ["favorites", "list", profile?.id],
		queryFn: () => favoritesRepository.getFavorites(profile!.id),
		enabled: !!profile,
	});
}

export function useFavoriteOfferIds() {
	const profile = useAuthStore((s) => s.profile);
	return useQuery({
		queryKey: ["favorites", "ids", profile?.id],
		queryFn: () => favoritesRepository.getFavoriteOfferIds(profile!.id),
		enabled: !!profile,
	});
}

export function useIsFavorite(offerId: string) {
	const { data } = useFavoriteOfferIds();
	return data?.has(offerId) ?? false;
}

export function useToggleFavorite() {
	const queryClient = useQueryClient();
	const profile = useAuthStore((s) => s.profile);
	return useMutation({
		mutationFn: async (offerId: string) => {
			const ids = queryClient.getQueryData<Set<string>>([
				"favorites",
				"ids",
				profile!.id,
			]);
			if (ids?.has(offerId) ?? false) {
				await favoritesRepository.removeFavoriteByOfferId(offerId, profile!.id);
			} else {
				await favoritesRepository.addFavorite(profile!.id, offerId);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["favorites"] });
		},
	});
}

// ─── Orders ─────────────────────────────────────────────────────────
export function useOrders() {
	const profile = useAuthStore((s) => s.profile);
	return useQuery({
		queryKey: ["orders", profile?.id],
		queryFn: () => orderRepository.getUserOrders(profile!.id),
		enabled: !!profile,
	});
}

export function useOrder(id: string) {
	return useQuery({
		queryKey: ["orders", id],
		queryFn: () => orderRepository.getOrderById(id),
		enabled: id.length > 0,
	});
}

/** Reserves an offer; the RPC returns a structured result (never throws business errors). */
export function useReserveOffer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { offerId: string; couponId?: string }) =>
			orderRepository.reserveOffer(input.offerId, input.couponId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orders"] });
			queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useCancelOrder() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (orderId: string) => orderRepository.cancelOrder(orderId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orders"] });
			// Cancelar devuelve stock a la oferta.
			queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useSubmitReview() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			orderId: string;
			businessId: string;
			productRating: number;
			businessRating: number;
			comment?: string;
		}) => orderRepository.submitReview(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orders"] });
			// El rating vive en la fila del negocio.
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
		},
	});
}
