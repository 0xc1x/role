import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner-native";
import type { Coupon, OrderStatus as OrderStatusType } from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { formatMoney } from "@/src/core/utils/formatters";

import { useAuthStore } from "@/src/features/auth/store";
import { offersRepository } from "@/src/features/offers/data/repository";
import { favoritesRepository } from "@/src/features/favorites/data/repository";
import { orderRepository } from "@/src/features/orders/data/repository";
import { couponIsValid, checkoutTotals, meetsCouponMinimum } from "@/src/features/orders/domain/order";
import {
	ACTIVE_ORDER_STATUSES,
	TERMINAL_ORDER_STATUSES,
} from "@/src/features/orders/domain/order";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import {
	useSavedAddresses,
	usePreferences,
} from "@/src/features/profile/hooks";

// ─── Offers ─────────────────────────────────────────────────────────
export function useOffer(id: string) {
	return useQuery({
		queryKey: ["offers", id],
		queryFn: () => offersRepository.getOfferById(id),
		enabled: id.length > 0,
	});
}

export function usePopularOffers(limit = 10, category?: string | null) {
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["offers", "popular", category ?? "all", lat, lng, radiusKm],
		queryFn: () =>
			category
				? offersRepository.getPopularOffersFiltered(category, params, limit)
				: offersRepository.getPopularOffers(params, limit),
	});
}

export function useExpiringSoonOffers(limit = 5) {
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["offers", "expiring", limit, lat, lng, radiusKm],
		queryFn: () => offersRepository.getExpiringSoonOffers(params, limit),
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
	radiusKm = 10,
	limit = 50,
) {
	const status = useAuthStore((s) => s.status);
	return useQuery({
		queryKey: ["businesses", "all", { lat, lng, searchQuery, type, radiusKm, limit }],
		queryFn: () =>
			offersRepository.getAllBusinesses({
				lat,
				lng,
				radiusKm,
				searchQuery,
				type,
				limit,
			}),
		enabled: status !== "guest",
	});
}

export function useFilteredOffers(filters: {
	category?: string | null;
	maxPrice?: number | null;
	maxDistanceKm?: number | null;
	lat?: number;
	lng?: number;
	searchQuery?: string | null;
	limit?: number | null;
}) {
	const status = useAuthStore((s) => s.status);
	return useQuery({
		queryKey: ["offers", "filtered", filters],
		queryFn: () =>
			offersRepository.getFilteredOffers({
				...filters,
				limit: filters.limit ?? undefined,
			}),
		enabled: status !== "guest",
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
	const status = useAuthStore((s) => s.status);
	return useInfiniteQuery({
		queryKey: ["offers", "filtered", "infinite", filters],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			offersRepository.getFilteredOffers({ ...filters, page: pageParam as number, limit: PAGE_SIZE }),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
		enabled: status !== "guest",
	});
}

export function useAllBusinessesInfinite(
	lat?: number | null,
	lng?: number | null,
	searchQuery?: string | null,
	type?: string | null,
) {
	const status = useAuthStore((s) => s.status);
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
		enabled: status !== "guest",
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
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["areas", "popular", lat, lng, radiusKm],
		queryFn: () => offersRepository.getPopularAreas(params),
	});
}

export function useRecentOffers(limit = 5) {
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["offers", "recent", limit, lat, lng, radiusKm],
		queryFn: () => offersRepository.getRecentOffers(params, limit),
	});
}

export function useNearbyBusinesses(limit = 5) {
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["businesses", "nearby", limit, lat, lng, radiusKm],
		queryFn: () => offersRepository.getNearbyBusinesses(params, limit),
	});
}

export function useSelectedAddress() {
	const profile = useAuthStore((s) => s.profile);
	const { data: addresses } = useSavedAddresses(profile?.id ?? "");
	return addresses?.find((a) => a.is_default);
}

/**
 * Radio de las preferencias del usuario (notification_radius_km) anclado a
 * su dirección default. Sin dirección no hay punto de referencia: los
 * repositorios reciben undefined y devuelven resultados sin filtrar.
 */
function useRadiusParams() {
	const profile = useAuthStore((s) => s.profile);
	const { data: preferences } = usePreferences(profile?.id ?? "");
	const address = useSelectedAddress();
	const lat = address?.latitude;
	const lng = address?.longitude;
	const radiusKm = preferences?.notification_radius_km ?? 5;
	return {
		lat,
		lng,
		radiusKm,
		params: lat != null && lng != null ? { lat, lng, radiusKm } : undefined,
	};
}

export function useNearbyOffersHook(limit = 10, category?: string | null) {
	const { lat, lng, radiusKm, params } = useRadiusParams();
	return useQuery({
		queryKey: ["offers", "nearby", lat, lng, radiusKm, limit, category ?? "all"],
		queryFn: () => {
			if (lat == null || lng == null) throw new Error("Ubicación requerida");
			return offersRepository.getNearbyOffers({
				lat,
				lng,
				radiusKm,
				limit,
				category: category ?? null,
			});
		},
		enabled: lat != null && lng != null,
	});
}

// ─── Favorites ──────────────────────────────────────────────────────
export function useFavorites() {
	const profile = useAuthStore((s) => s.profile);
	const profileId = profile?.id;
	return useInfiniteQuery({
		queryKey: ["favorites", "list", profileId],
		initialPageParam: 0,
		queryFn: ({ pageParam }) => {
			if (!profileId) throw new Error("Sesión requerida");
			return favoritesRepository.getFavorites(profileId, {
				limit: PAGE_SIZE,
				offset: (pageParam as number) * PAGE_SIZE,
			});
		},
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
		enabled: !!profile,
	});
}

export function useFavoriteOfferIds() {
	const profile = useAuthStore((s) => s.profile);
	const profileId = profile?.id;
	return useQuery({
		queryKey: ["favorites", "ids", profileId],
		queryFn: () => {
			if (!profileId) throw new Error("Sesión requerida");
			return favoritesRepository.getFavoriteOfferIds(profileId);
		},
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
			const profileId = profile?.id;
			if (!profileId) throw new Error("Sesión requerida");
			const ids = queryClient.getQueryData<Set<string>>([
				"favorites",
				"ids",
				profileId,
			]);
			if (ids?.has(offerId) ?? false) {
				await favoritesRepository.removeFavoriteByOfferId(offerId, profileId);
			} else {
				await favoritesRepository.addFavorite(profileId, offerId);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["favorites"] });
		},
		onError: () => toast.error(strings.common.error),
	});
}

// ─── Orders ─────────────────────────────────────────────────────────
export interface OrderListFilters {
	statuses?: readonly OrderStatusType[];
	status?: OrderStatusType;
	from?: string;
	to?: string;
	search?: string;
}

export function useOrders(filters: OrderListFilters = {}) {
	const profile = useAuthStore((s) => s.profile);
	const profileId = profile?.id;
	return useInfiniteQuery({
		queryKey: ["orders", profileId, filters],
		initialPageParam: 0,
		queryFn: ({ pageParam }) => {
			if (!profileId) throw new Error("Sesión requerida");
			return orderRepository.getUserOrders(profileId, {
				...filters,
				limit: PAGE_SIZE,
				offset: (pageParam as number) * PAGE_SIZE,
			});
		},
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
		enabled: !!profile,
	});
}

/** Exact tab counts (head-count queries, no rows fetched). */
export function useOrderCounts(filters: { search?: string; pastFrom?: string; pastTo?: string }) {
	const profile = useAuthStore((s) => s.profile);
	const profileId = profile?.id;
	return useQuery({
		queryKey: ["orders", profileId, "counts", filters],
		queryFn: async () => {
			if (!profileId) throw new Error("Sesión requerida");
			const [activeCount, pastCount] = await Promise.all([
				orderRepository.countUserOrders(profileId, {
					statuses: ACTIVE_ORDER_STATUSES,
					search: filters.search,
				}),
				orderRepository.countUserOrders(profileId, {
					statuses: TERMINAL_ORDER_STATUSES,
					search: filters.search,
					from: filters.pastFrom,
					to: filters.pastTo,
				}),
			]);
			return { activeCount, pastCount };
		},
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
			// Cross-role: the business orders list shows the new reservation
			// (businessId unknown here, so the whole prefix is refreshed).
			queryClient.invalidateQueries({ queryKey: ["businesses"] });
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
			// Cross-role: the business orders list shows the cancellation.
			queryClient.invalidateQueries({ queryKey: ["businesses"] });
		},
		onError: () => toast.error(strings.orders.cancelError),
	});
}

/** Validación de cupón on-demand (sin caché que invalidar). */
export function useApplyCoupon(offerDetail: OfferDetail | undefined) {
	const [couponInput, setCouponInput] = useState("");
	const [couponError, setCouponError] = useState<string | null>(null);
	const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
	// El cupón aplicado pertenece a la oferta: el consumidor remonta con
	// key por oferta y el estado reinicia solo, sin efectos.
	// react-doctor-disable-next-line query-mutation-missing-invalidation
	const mutation = useMutation({
		mutationFn: async (code: string) => {
			if (!offerDetail) throw new Error("Oferta no disponible");
			return orderRepository.getCouponByCode(code, offerDetail.offer.business_id);
		},
		onSuccess: (coupon) => {
			if (!offerDetail) return;
			if (!coupon || !couponIsValid(coupon)) {
				setCouponError(strings.checkout.couponUnavailable);
				return;
			}
			if (
				!meetsCouponMinimum(
					offerDetail.offer.discounted_price,
					coupon.min_order_amount,
				)
			) {
				setCouponError(
					strings.checkout.couponMinNotMet.replace(
						"{amount}",
						formatMoney(coupon.min_order_amount ?? 0),
					),
				);
				return;
			}
			setAppliedCoupon(coupon);
			setCouponError(null);
		},
		onError: () => setCouponError(strings.checkout.invalidCoupon),
	});

	const applyCoupon = () => {
		const code = couponInput.trim().toUpperCase();
		if (!code) return;
		mutation.mutate(code);
	};

	const clearCoupon = () => {
		setAppliedCoupon(null);
		setCouponInput("");
		setCouponError(null);
	};

	const changeInput = (value: string) => {
		setCouponInput(value);
		setCouponError(null);
	};

	const totals = offerDetail
		? checkoutTotals(offerDetail.offer, appliedCoupon)
		: { offerDiscount: 0, coupon: 0, total: 0 };
	const discount = totals.coupon;
	const total = totals.total;

	return {
		couponInput,
		couponError,
		appliedCoupon,
		applying: mutation.isPending,
		discount,
		total,
		applyCoupon,
		clearCoupon,
		changeInput,
	};
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
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["orders"] });
			queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
			queryClient.invalidateQueries({
				queryKey: ["reviews", "order", variables.orderId],
			});
			// El rating vive en la fila del negocio y en el detalle de oferta.
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
			void queryClient.invalidateQueries({ queryKey: ["userStats"] });
		},
	});
}

/** Reseñas del usuario actual (pantalla Mis reseñas). */
export function useMyReviews() {
	const profile = useAuthStore((s) => s.profile);
	return useInfiniteQuery({
		queryKey: ["my-reviews", profile?.id],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			orderRepository.getMyReviews({
				limit: PAGE_SIZE,
				offset: (pageParam as number) * PAGE_SIZE,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
		enabled: !!profile,
	});
}

/** Reseña de un pedido (precarga del editor / detalle negocio read-only). */
export function useReviewByOrder(orderId: string) {
	return useQuery({
		queryKey: ["reviews", "order", orderId],
		queryFn: () => orderRepository.getReviewByOrderId(orderId),
		enabled: orderId.length > 0,
	});
}

export function useDeleteReview() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (reviewId: string) => orderRepository.deleteReview(reviewId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
			queryClient.invalidateQueries({ queryKey: ["orders"] });
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
			void queryClient.invalidateQueries({ queryKey: ["userStats"] });
		},
		onError: () => toast.error(strings.orders.deleteReviewError),
	});
}
