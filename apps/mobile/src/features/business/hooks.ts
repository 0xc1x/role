import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";

import {
	businessRepository,
	deleteOffer,
	saveOffer,
} from "@/features/business/data/repository";
import { notificationRepository } from "@/features/business/data/notifications";
import { orderRepository } from "@/features/orders/data/repository";

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

export function useBusinessOffers(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "offers"],
		queryFn: () => businessRepository.getBusinessOffers(businessId),
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

export function useBusinessCoupons(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "coupons"],
		queryFn: () => businessRepository.getCoupons(businessId),
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

export function useBusinessPayouts(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "payouts"],
		queryFn: () => businessRepository.getPayouts(businessId),
		enabled: businessId.length > 0,
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
export function useBusinessOrders(businessId: string) {
	return useQuery({
		queryKey: ["businesses", businessId, "orders"],
		queryFn: () => orderRepository.getBusinessOrders(businessId),
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
			}
		},
	});
}
