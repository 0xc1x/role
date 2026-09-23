import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner-native";
import { strings } from "@/src/core/i18n/strings";
import type {
	OrderStatus as OrderStatusType,
	PayoutStatus as PayoutStatusType,
} from "@0xc1x/role-commons";

import {
	businessRepository,
	deleteOffer,
	saveOffer,
} from "@/src/features/business/data/repository";
import { notificationRepository } from "@/src/features/business/data/notifications";
// Los writes de pedidos (RPCs) viven en el repo de orders; estos hooks solo
// orquestan vistas del rol negocio sobre esa API.
import { orderRepository } from "@/src/features/orders/data/repository";

export function useBusinesses(ownerId: string) {
	return useQuery({
		queryKey: ["businesses", "owned", ownerId],
		queryFn: () => businessRepository.getBusinessesByOwnerId(ownerId),
		enabled: ownerId.length > 0,
	});
}

export function useBusinessProfile(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId],
		queryFn: () => businessRepository.getBusinessProfile(businessId),
		enabled: businessId.length > 0,
	});
}

/** Lista paginada de reseñas del negocio (pantalla dedicada + preview por oferta). */
export function useBusinessReviews(
	businessId: string,
	filters: { offerId?: string | null; limit?: number } = {},
) {
	const pageSize = filters.limit ?? REVIEWS_PAGE_SIZE;
	const offerId = filters.offerId ?? null;
	return useInfiniteQuery({
		// pageSize in key: the top-3 preview (OfferReviewsCard) and the full
		// screen (20/page) must not share cached pages.
		queryKey: ["businesses", businessId, "reviews", { offerId, pageSize }],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			businessRepository.getBusinessReviews(businessId, {
				offerId,
				limit: pageSize,
				offset: (pageParam as number) * pageSize,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < pageSize ? undefined : (lastPageParam as number) + 1,
		enabled: businessId.length > 0,
	});
}

/** Total de reseñas via server head-count (no rows fetched). */
export function useBusinessReviewCount(
	businessId: string,
	filters: { offerId?: string | null } = {},
) {
	const offerId = filters.offerId ?? null;
	return useQuery({
		queryKey: ["businesses", businessId, "reviews", "count", { offerId }],
		queryFn: () =>
			businessRepository.countBusinessReviews(businessId, { offerId }),
		enabled: businessId.length > 0,
	});
}

export interface BusinessOfferListFilters {
	locationId?: string | null;
	search?: string;
	isActive?: boolean;
	categoryId?: string | null;
	orderBy?: "created_at" | "title" | "discounted_price" | "stock";
	ascending?: boolean;
	limit?: number;
}

export function useBusinessOffers(
	businessId: string,
	filters: BusinessOfferListFilters = {},
) {
	const pageSize = filters.limit ?? OFFERS_PAGE_SIZE;
	const {
		locationId = null,
		search = "",
		isActive,
		categoryId = null,
		orderBy = null,
		ascending = null,
	} = filters;
	return useInfiniteQuery({
		// limit/categoryId/order in key: different page sizes and orderings
		// must not share cached pages.
		queryKey: [
			"businesses",
			businessId,
			"offers",
			{
				locationId,
				search,
				isActive: isActive ?? null,
				categoryId,
				orderBy,
				ascending,
				limit: pageSize,
			},
		],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			businessRepository.getBusinessOffers(businessId, {
				locationId,
				search: search.length > 0 ? search : undefined,
				isActive,
				categoryId: categoryId ?? undefined,
				orderBy: orderBy ?? undefined,
				ascending: ascending ?? undefined,
				limit: pageSize,
				offset: (pageParam as number) * pageSize,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < pageSize ? undefined : (lastPageParam as number) + 1,
		enabled: businessId.length > 0,
	});
}

/** Catalog totals via server head-counts (no rows fetched). */
export function useBusinessOfferCount(
	businessId: string,
	filters: Omit<BusinessOfferListFilters, "limit"> = {},
) {
	return useQuery({
		queryKey: ["businesses", businessId, "offers", "count", filters],
		queryFn: () => businessRepository.countBusinessOffers(businessId, filters),
		enabled: businessId.length > 0,
	});
}

export function useSaveOffer(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: Parameters<typeof saveOffer>[0]) => saveOffer(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "offers"],
			});
			// El detalle y las vistas consumidoras leen de ["offers", ...].
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useDeleteOffer(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (offerId: string) => deleteOffer(offerId),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "offers"],
			});
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useToggleOfferActive(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ offerId, isActive }: { offerId: string; isActive: boolean }) =>
			businessRepository.toggleOfferStatus(offerId, isActive),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "offers"],
			});
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useBusinessLocations(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "locations"],
		queryFn: () => businessRepository.getLocations(businessId),
		enabled: businessId.length > 0,
	});
}

export function useBusinessLocation(locationId: string) {
	return useQuery({
		queryKey: ["business-locations", locationId],
		queryFn: () => businessRepository.getLocation(locationId),
		enabled: locationId.length > 0,
	});
}

export function useUpsertLocation(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			location: Parameters<typeof businessRepository.upsertLocation>[0],
		) => businessRepository.upsertLocation(location),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId],
			});
			void queryClient.invalidateQueries({ queryKey: ["business-locations"] });
		},
	});
}

export function useToggleLocationStatus(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
			businessRepository.toggleLocationStatus(id, isActive),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId],
			});
			void queryClient.invalidateQueries({ queryKey: ["business-locations"] });
		},
	});
}

export function useBusinessCoupons(
	businessId: string,
	filters: { isActive?: boolean } = {},
) {
	const { isActive } = filters;
	return useInfiniteQuery({
		queryKey: [
			"businesses",
			businessId,
			"coupons",
			{ isActive: isActive ?? null },
		],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			businessRepository.getCoupons(businessId, {
				isActive,
				limit: COUPONS_PAGE_SIZE,
				offset: (pageParam as number) * COUPONS_PAGE_SIZE,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < COUPONS_PAGE_SIZE
				? undefined
				: (lastPageParam as number) + 1,
		enabled: businessId.length > 0,
	});
}

/** Coupon totals via server head-counts (no rows fetched). */
export function useBusinessCouponCount(
	businessId: string,
	filters: { isActive?: boolean } = {},
) {
	return useQuery({
		queryKey: ["businesses", businessId, "coupons", "count", filters],
		queryFn: () => businessRepository.countCoupons(businessId, filters),
		enabled: businessId.length > 0,
	});
}

export function useUpsertCoupon(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			coupon: Parameters<typeof businessRepository.upsertCoupon>[0],
		) => businessRepository.upsertCoupon(coupon),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "coupons"],
			});
			void queryClient.invalidateQueries({ queryKey: ["coupons"] });
		},
	});
}

export function useDeleteCoupon(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => businessRepository.deleteCoupon(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "coupons"],
			});
			void queryClient.invalidateQueries({ queryKey: ["coupons"] });
		},
	});
}

export function useBusinessCoupon(couponId: string) {
	return useQuery({
		queryKey: ["coupons", couponId],
		queryFn: () => businessRepository.getCoupon(couponId),
		enabled: couponId.length > 0,
	});
}

export function useToggleCouponStatus(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
			businessRepository.toggleCouponStatus(id, isActive),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "coupons"],
			});
			void queryClient.invalidateQueries({ queryKey: ["coupons"] });
		},
	});
}

export function useCreateBusiness() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: Parameters<typeof businessRepository.createBusiness>[0]) =>
			businessRepository.createBusiness(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
		},
	});
}

export function useBusinessHours(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "hours"],
		queryFn: () => businessRepository.getBusinessHours(businessId),
		enabled: businessId.length > 0,
	});
}

export function useUpdateBusiness(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (patch: Parameters<typeof businessRepository.updateBusiness>[1]) =>
			businessRepository.updateBusiness(businessId, patch),
		onSuccess: () => {
			// Prefijo ancho: cubre perfil propio, owned y directorio consumidor.
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
			// Los datos del negocio viven embebidos en el detalle de oferta.
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
	});
}

export function useBusinessPayouts(
	businessId: string,
	filters: { status?: PayoutStatusType } = {},
) {
	const { status = null } = filters;
	return useInfiniteQuery({
		queryKey: ["businesses", businessId, "payouts", { status }],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			businessRepository.getPayouts(businessId, {
				status: status ?? undefined,
				limit: PAYOUTS_PAGE_SIZE,
				offset: (pageParam as number) * PAYOUTS_PAGE_SIZE,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < PAYOUTS_PAGE_SIZE
				? undefined
				: (lastPageParam as number) + 1,
		enabled: businessId.length > 0,
	});
}

/**
 * Exact balance cards over ALL payouts (unfiltered aggregate — independent
 * from the status-filtered list, so the cards never read 0 under a filter).
 */
export function useBusinessPayoutTotals(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "payouts", "totals"],
		queryFn: () => businessRepository.getPayoutTotals(businessId),
		enabled: businessId.length > 0,
	});
}

/** Single payout by id (detail screen — no list fetch). */
export function useBusinessPayout(payoutId: string) {
	return useQuery({
		queryKey: ["businesses", "payout", payoutId],
		queryFn: () => businessRepository.getPayout(payoutId),
		enabled: payoutId.length > 0,
	});
}

export function useBusinessStats(
	businessId: string,
	startDate: string,
	endDate: string,
) {
	return useQuery({
		queryKey: ["businesses", businessId, "stats", startDate, endDate],
		queryFn: () =>
			businessRepository.getBusinessStats(businessId, startDate, endDate),
		enabled:
			businessId.length > 0 && startDate.length > 0 && endDate.length > 0,
	});
}

export function useBusinessNotifications(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "notifications"],
		queryFn: () => notificationRepository.getPreferences(businessId),
		enabled: businessId.length > 0,
	});
}

export function useUpdateBusinessNotifications(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			prefs: Parameters<typeof notificationRepository.updatePreferences>[1],
		) => notificationRepository.updatePreferences(businessId, prefs),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "notifications"],
			});
		},
	});
}

/** Business orders (shared order repository, filtered by business id). */
export interface BusinessOrderListFilters {
	statuses?: readonly OrderStatusType[];
	status?: OrderStatusType;
	branchId?: string | null;
	search?: string;
	from?: string;
	to?: string;
	ascending?: boolean;
}

const ORDERS_PAGE_SIZE = 20;
const REVIEWS_PAGE_SIZE = 20;
const OFFERS_PAGE_SIZE = 20;
const COUPONS_PAGE_SIZE = 20;
const PAYOUTS_PAGE_SIZE = 20;

export function useBusinessOrders(businessId: string, filters: BusinessOrderListFilters = {}) {
	return useInfiniteQuery({
		queryKey: ["businesses", businessId, "orders", filters],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			orderRepository.getBusinessOrders(businessId, {
				...filters,
				limit: ORDERS_PAGE_SIZE,
				offset: (pageParam as number) * ORDERS_PAGE_SIZE,
			}),
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < ORDERS_PAGE_SIZE ? undefined : (lastPageParam as number) + 1,
		enabled: businessId.length > 0,
	});
}

/** Headline metrics via server head-counts (no rows fetched). */
export function useBusinessOrderStats(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "orders", "stats"],
		queryFn: async () => {
			const start = new Date();
			start.setUTCHours(0, 0, 0, 0);
			const [pendingCount, readyCount, todayCompletedCount] = await Promise.all([
				orderRepository.countBusinessOrders(businessId, { status: "pending" }),
				orderRepository.countBusinessOrders(businessId, { status: "ready_for_pickup" }),
				orderRepository.countBusinessOrders(businessId, {
					status: "completed",
					from: start.toISOString(),
				}),
			]);
			return { pendingCount, readyCount, todayCompletedCount };
		},
		enabled: businessId.length > 0,
	});
}

const businessOrdersKey = (businessId: string) => [
	"businesses",
	businessId,
	"orders",
];

/** Business-side status transition that invalidates the orders list. */
export function useUpdateOrderStatus(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			orderId,
			status,
		}: {
			orderId: string;
			status: OrderStatusType;
		}) => orderRepository.updateOrderStatus(orderId, status),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: businessOrdersKey(businessId),
			});
			void queryClient.invalidateQueries({ queryKey: ["orders"] });
			// El cambio de estado mueve contadores y ventas agregadas.
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "orders", "stats"],
			});
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "stats"],
			});
		},
		onError: () => toast.error(strings.business.ordersStatusError),
	});
}

/**
 * Business-side cancel via the `cancel_order` RPC (p_business_id): server
 * rules and stock restock live in the DB. Invalidates offers too, since the
 * cancel returns the reserved stock to the offer.
 */
export function useCancelBusinessOrder(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (orderId: string) =>
			orderRepository.cancelOrderForBusiness(orderId, businessId),
		onSuccess: (result) => {
			if (result.success) {
				void queryClient.invalidateQueries({
					queryKey: businessOrdersKey(businessId),
				});
				void queryClient.invalidateQueries({ queryKey: ["orders"] });
				void queryClient.invalidateQueries({ queryKey: ["offers"] });
				void queryClient.invalidateQueries({
					queryKey: ["businesses", businessId, "orders", "stats"],
				});
				void queryClient.invalidateQueries({
					queryKey: ["businesses", businessId, "stats"],
				});
			}
		},
	});
}

/** Validates a pickup code (`validate_pickup_code` RPC); refetches on success. */
export function useValidatePickupCode(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			orderId,
			pickupCode,
		}: {
			orderId: string;
			pickupCode: string;
		}) => orderRepository.validatePickupCode(orderId, pickupCode),
		onSuccess: (result) => {
			if (result.success) {
				void queryClient.invalidateQueries({
					queryKey: businessOrdersKey(businessId),
				});
				void queryClient.invalidateQueries({ queryKey: ["orders"] });
				// Pickup completes a sale: the sales-stats RPC goes stale.
				void queryClient.invalidateQueries({
					queryKey: ["businesses", businessId, "stats"],
				});
			}
		},
		onError: () => toast.error(strings.business.ordersValidateError),
	});
}
