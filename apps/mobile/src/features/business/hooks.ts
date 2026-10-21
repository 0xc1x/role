import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner-native";
import { strings } from "@/src/core/i18n/strings";
import type {
	CreateBusinessMemberDto,
	OrderStatus as OrderStatusType,
	PayoutStatus as PayoutStatusType,
	UpdateBusinessMemberDto,
} from "@0xc1x/role-commons";

import {
	businessRepository,
	deleteOffer,
	saveOffer,
} from "@/src/features/business/data/repository";
import { notificationRepository } from "@/src/features/business/data/notifications";
// Los accesos del equipo se administran por el API (ADR-0013 §A.1): el tope
// del plan y el alcance del gerente son reglas del servidor, no del cliente.
import { staffRepository } from "@/src/features/business/data/staff";
// El sello de la sesión de staff vive en el módulo de auth porque lo sella el
// LOGIN también; la lista del equipo lo necesita porque es la lectura que
// el API condiciona al sello (§5.2).
import { stampStaffSession } from "@/src/features/auth/data/staff-session";
// Los writes de pedidos (RPCs) viven en el repo de orders; estos hooks solo
// orquestan vistas del rol negocio sobre esa API.
import { orderRepository } from "@/src/features/orders/data/repository";

/**
 * Los negocios que el lector opera, con su rol en cada uno.
 *
 * La firma no cambia —las pantallas del panel la llaman igual— pero lo que
 * devuelve ya no es sólo del dueño: es de quien tenga una membresía viva en
 * el negocio, con el rol que tiene en él.
 */
export function useBusinesses(ownerId: string) {
	return useQuery({
		queryKey: ["businesses", "operated", ownerId],
		queryFn: () => businessRepository.getOperatedBusinesses(ownerId),
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
		// Alta exige foto: sin ella la oferta se publicaba sin imagen y sin
		// aviso. En edición la imagen ya almacenada se conserva, así que la
		// foto nueva es opcional.
		mutationFn: (input: Parameters<typeof saveOffer>[0]) =>
			saveOffer(input, input.id == null),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "offers"],
			});
			// El detalle y las vistas consumidoras leen de ["offers", ...].
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
			// El guardado aplicó con la imagen anterior: el dueño tiene que
			// saber que su foto nueva no se publicó.
			if (result.imageUploadFailed)
				toast.error(strings.business.photoUploadKept);
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
		onError: () => toast.error(strings.business.productDeleteError),
	});
}

export function useToggleOfferActive(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			offerId,
			isActive,
		}: {
			offerId: string;
			isActive: boolean;
		}) => businessRepository.toggleOfferStatus(offerId, isActive),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["businesses", businessId, "offers"],
			});
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
		onError: () => toast.error(strings.business.productToggleError),
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
		onError: () => toast.error(strings.business.locationSaveError),
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
		onError: () => toast.error(strings.business.locationToggleError),
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
		onError: () => toast.error(strings.business.couponGenerateError),
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
		onError: () => toast.error(strings.business.couponToggleError),
	});
}

export function useCreateBusiness() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			input: Parameters<typeof businessRepository.createBusiness>[0],
		) => businessRepository.createBusiness(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
		},
		onError: () => toast.error(strings.business.businessCreateError),
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
		mutationFn: (
			patch: Parameters<typeof businessRepository.updateBusiness>[1],
		) => businessRepository.updateBusiness(businessId, patch),
		onSuccess: () => {
			// Prefijo ancho: cubre perfil propio, owned y directorio consumidor.
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
			// Los datos del negocio viven embebidos en el detalle de oferta.
			void queryClient.invalidateQueries({ queryKey: ["offers"] });
		},
		onError: () => toast.error(strings.business.editBusinessError),
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

export function useBusinessOrders(
	businessId: string,
	filters: BusinessOrderListFilters = {},
) {
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
			lastPage.length < ORDERS_PAGE_SIZE
				? undefined
				: (lastPageParam as number) + 1,
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
			const [pendingCount, readyCount, todayCompletedCount] = await Promise.all(
				[
					orderRepository.countBusinessOrders(businessId, {
						status: "pending",
					}),
					orderRepository.countBusinessOrders(businessId, {
						status: "ready_for_pickup",
					}),
					orderRepository.countBusinessOrders(businessId, {
						status: "completed",
						from: start.toISOString(),
					}),
				],
			);
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

// ─── Los accesos del equipo (ADR-0013 §A.1) ────────────────────────────────

/**
 * La clave del caché donde vive la lista de accesos del negocio.
 *
 * El equipo tiene su propia entrada y no comparte la de los negocios: lo que
 * pasa por `/staff` no es un dato del negocio, es quién lo opera, y las dos
 * listas se invalidan por razones distintas.
 */
const staffListKey = (businessId: string) => ["staff", "list", businessId];

/**
 * El nombre con el que una mutación del equipo se presenta al diagnóstico.
 *
 * El `MutationCache` global lee `mutation.options.mutationKey` para el reporte
 * de Sentry (`src/core/query/client.ts`), así que sin nombre un fallo del
 * equipo sería anónimo: no se sabría si fue el alta, la pausa o la baja.
 */
const staffMutationKey = (operation: string) => ["staff", operation];

/**
 * Los accesos del negocio, con su rol, su estado y su alcance.
 *
 * La consulta se habilita sólo con un negocio: sin id no hay ruta y una
 * consulta a `/businesses//staff` sería un 404 que nadie pidió.
 *
 * ─── POR QUÉ LA CONSULTA SELLA LA SESIÓN ANTES DE LEER ───────────────────────
 *
 * Porque la lectura del equipo está CONDICIONADA al sello (§5.2): una
 * membresía con `session_ttl_hours > 0` que nunca se selló se rechaza con un
 * 403 («Tu sesión venció…»), y el dueño es el único inmune. El sello del
 * login sella SIN negocio —la base lo resuelve sólo cuando la persona tiene
 * una membresía viva— y con dos o más no sella nada (`multiple_businesses`):
 * un gerente con varios negocios llega al panel con la sesión sin sellar y su
 * conteo de equipo nunca aparece.
 *
 * Por eso el sello va AQUÍ, y no en un efecto de la pantalla: el que lee la
 * lista es el que necesita la puerta abierta. Sellar antes de leer quita la
 * carrera —el 403 del primer intento y su reintento— y hace que la lectura
 * valga en el primer intento.
 *
 * Y el sello NO es un error si falla: `stampStaffSession` nunca lanza (el
 * login ya ocurrió), así que un API caído no convierte la lista en un fallo
 * distinto del que ya iba a haber.
 *
 * ─── Y POR QUÉ LA PANTALLA DEL EQUIPO TAMBIÉN SELLA ───────────────────────────
 *
 * Porque el sello tiene un efecto observable que la consulta no tiene: la
 * tarjeta de entrega y el alcance de la sesión se leen del estado del API.
 * El POST es idempotente en efecto —sellar dos veces la misma membresía la
 * deja sellada igual—, así que la duplicidad no molesta: lo que se evita es
 * que la pantalla deje de sellar cuando el sello de la consulta no alcanza.
 */
export function useStaffMembers(businessId: string) {
	return useQuery({
		queryKey: staffListKey(businessId),
		queryFn: async () => {
			await stampStaffSession(businessId);
			return staffRepository.list(businessId);
		},
		enabled: Boolean(businessId),
	});
}

/**
 * Las nueve operaciones del equipo, una mutación cada una.
 *
 * ─── POR QUÉ NO HAY UN TOAST POR MUTACIÓN ───────────────────────────────────
 *
 * Porque el API ya escribe la prosa PARA esta persona —«Tu plan no admite otro
 * acceso»— y esa prosa llega en el `AppError` con su categoría: un 422 es
 * `business_rule`, un 409 es `conflict`, un 400 es `validation`. Un toast
 * genérico taparía el motivo real y dejaría a la persona sin saber qué
 * corregir. La pantalla pinta `error.message` y decide con `error.kind`.
 *
 * ─── Y POR QUÉ CADA UNA INVALIDA LA LISTA ────────────────────────────────────
 *
 * Porque la lista es la lectura de ese estado: un acceso dado de alta, editado,
 * pausado, reactivado o dado de baja no se ve hasta que la lista se vuelve a
 * leer. Y la transferencia invalida además los NEGOCIOS: el dueño cambió y el
 * panel lee ese rol en `useBusinesses`.
 *
 * ─── Y POR QUÉ CADA UNA TIENE NOMBRE ─────────────────────────────────────────
 *
 * Porque el `MutationCache` global lee `mutation.options.mutationKey` para el
 * reporte de Sentry: sin nombre, un fallo del equipo sería anónimo y no se
 * sabría si fue el alta, la pausa o la baja.
 *
 * Las variables de cada mutación: `create(body)`, `update({ memberId, body })`,
 * `updateAlias({ memberId, alias })` y —las que sólo necesitan a quién——
 * `rotate(memberId)`, `disable(memberId)`, `enable(memberId)`,
 * `remove(memberId)` y `transferOwnership(memberId)`. El corte de emergencia
 * no necesita ni a quién: `revokeAll()` corta lo que quien llama administra.
 */
export function useStaffMutations(businessId: string) {
	const queryClient = useQueryClient();

	const invalidateStaffList = () => {
		void queryClient.invalidateQueries({ queryKey: staffListKey(businessId) });
	};

	const create = useMutation({
		mutationKey: staffMutationKey("create"),
		mutationFn: (body: CreateBusinessMemberDto) =>
			staffRepository.create(businessId, body),
		onSuccess: invalidateStaffList,
	});

	const update = useMutation({
		mutationKey: staffMutationKey("update"),
		mutationFn: ({
			memberId,
			body,
		}: {
			memberId: string;
			body: UpdateBusinessMemberDto;
		}) => staffRepository.update(businessId, memberId, body),
		onSuccess: invalidateStaffList,
	});

	const updateAlias = useMutation({
		mutationKey: staffMutationKey("update-alias"),
		mutationFn: ({ memberId, alias }: { memberId: string; alias: string }) =>
			staffRepository.updateAlias(businessId, memberId, alias),
		onSuccess: invalidateStaffList,
	});

	const rotate = useMutation({
		mutationKey: staffMutationKey("rotate"),
		mutationFn: (memberId: string) =>
			staffRepository.rotate(businessId, memberId),
		onSuccess: invalidateStaffList,
	});

	const disable = useMutation({
		mutationKey: staffMutationKey("disable"),
		mutationFn: (memberId: string) =>
			staffRepository.disable(businessId, memberId),
		onSuccess: invalidateStaffList,
	});

	const enable = useMutation({
		mutationKey: staffMutationKey("enable"),
		mutationFn: (memberId: string) =>
			staffRepository.enable(businessId, memberId),
		onSuccess: invalidateStaffList,
	});

	const remove = useMutation({
		mutationKey: staffMutationKey("remove"),
		mutationFn: (memberId: string) =>
			staffRepository.remove(businessId, memberId),
		onSuccess: invalidateStaffList,
	});

	const transferOwnership = useMutation({
		mutationKey: staffMutationKey("transfer-ownership"),
		mutationFn: (memberId: string) =>
			staffRepository.transferOwnership(businessId, memberId),
		onSuccess: () => {
			invalidateStaffList();
			// El rol del dueño cambió: el panel lo lee de `useBusinesses`.
			void queryClient.invalidateQueries({ queryKey: ["businesses"] });
		},
	});

	/**
	 * El corte de emergencia: todos los accesos del negocio de una vez.
	 *
	 * ─── POR QUÉ NO INVALIDA LOS NEGOCIOS ─────────────────────────────────────
	 *
	 * Porque el corte no cambia el ROL de nadie: corta accesos, y el rol se
	 * lee de la membresía. La lista sí cambia —TODAS sus filas—, así que la
	 * lista es lo que hay que volver a leer.
	 */
	const revokeAll = useMutation({
		mutationKey: staffMutationKey("revoke-all"),
		mutationFn: () => staffRepository.revokeAll(businessId),
		onSuccess: invalidateStaffList,
	});

	return {
		create,
		update,
		updateAlias,
		rotate,
		disable,
		enable,
		remove,
		transferOwnership,
		revokeAll,
	};
}
