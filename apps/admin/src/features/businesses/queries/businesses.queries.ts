import type {
	BusinessVerificationStatus,
	CreateBusinessDto,
	CreateBusinessLocationDto,
	ListBusinessesQuery,
	UpdateBusinessDto,
	UpdateBusinessLocationDto,
} from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyMutationError } from "@/lib/api/notify";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { businessesApi, businessLocationsApi } from "../api/businesses.api";
import { businessesKeys } from "./businesses.keys";

export const businessesListOptions = createListOptions(
	businessesKeys,
	businessesApi.list,
);

export function useBusinessesList(params?: ListBusinessesQuery) {
	return useQuery(businessesListOptions(params));
}

/**
 * Avisos transaccionales del negocio (aprobación/rechazo). Se consulta al abrir
 * el drawer: el correo se drena en segundo plano, así que una caché larga
 * mostraría un "pendiente" que ya cambió.
 */
export function useBusinessEmailSends(id: string | null) {
	return useQuery({
		queryKey: businessesKeys.emailSends(id ?? ""),
		queryFn: () => businessesApi.listEmailSends(id as string),
		enabled: Boolean(id),
		staleTime: 5_000,
	});
}

/**
 * Puntos de retiro del negocio, para la ficha.
 *
 * NO se filtra por `is_active`: el `DELETE` de la API desactiva la fila en vez de
 * borrarla, así que esconder las inactivas haría creer al operador que desaparecieron
 * y le quitaría el único camino para reactivarlas desde el panel.
 *
 * El endpoint está paginado y el drawer muestra el juego completo del negocio, así
 * que se pide el máximo del contrato (`limit` máx. 100). Un negocio con más de 100
 * puntos se vería truncado: es el techo del contrato, no una decisión de esta vista.
 */
const ALL_LOCATIONS_PAGE = { page: 1, limit: 100 } as const;

export function useBusinessLocations(businessId: string | null) {
	return useQuery({
		queryKey: businessesKeys.locations(businessId ?? ""),
		queryFn: () =>
			businessLocationsApi
				.forBusiness(businessId as string)
				.list(ALL_LOCATIONS_PAGE),
		enabled: Boolean(businessId),
		staleTime: 30_000,
	});
}

/**
 * Las ubicaciones viven bajo la clave del negocio, no bajo `businessesKeys.lists()`:
 * invalidar la lista de negocios por escrito un punto de retiro refetcharía
 * páginas que el operador no está tocando. Se invalidan solo ellas.
 */
function useInvalidateBusinessLocations(businessId: string) {
	const queryClient = useQueryClient();
	return (): void => {
		void queryClient.invalidateQueries({
			queryKey: businessesKeys.locations(businessId),
		});
	};
}

export function useCreateBusinessLocation(businessId: string) {
	const invalidate = useInvalidateBusinessLocations(businessId);
	return useMutation({
		mutationKey: businessesKeys.locations(businessId),
		mutationFn: (body: CreateBusinessLocationDto) =>
			businessLocationsApi.forBusiness(businessId).create(body),
		onSuccess: invalidate,
	});
}

export function useUpdateBusinessLocation(businessId: string) {
	const invalidate = useInvalidateBusinessLocations(businessId);
	return useMutation({
		mutationKey: businessesKeys.locations(businessId),
		mutationFn: ({
			locationId,
			body,
		}: {
			locationId: string;
			body: UpdateBusinessLocationDto;
		}) => businessLocationsApi.forBusiness(businessId).update(locationId, body),
		onSuccess: invalidate,
	});
}

export function useDeleteBusinessLocation(businessId: string) {
	const invalidate = useInvalidateBusinessLocations(businessId);
	return useMutation({
		mutationKey: businessesKeys.locations(businessId),
		mutationFn: (locationId: string) =>
			businessLocationsApi.forBusiness(businessId).remove(locationId),
		onSuccess: invalidate,
	});
}

export const useCreateBusiness = createUseCreate<
	CreateBusinessDto,
	Awaited<ReturnType<typeof businessesApi.create>>
>(businessesKeys, businessesApi.create);

export const useUpdateBusiness = createUseUpdate<
	UpdateBusinessDto,
	Awaited<ReturnType<typeof businessesApi.update>>
>(businessesKeys, businessesApi.update);

export const useDeleteBusiness = createUseDelete(
	businessesKeys,
	businessesApi.remove,
);

export function useVerifyBusiness() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: businessesKeys.all,
		mutationFn: ({
			id,
			verification_status,
			rejection_reason,
		}: {
			id: string;
			verification_status: BusinessVerificationStatus;
			rejection_reason?: string | null;
		}) =>
			businessesApi.update(id, {
				verification_status,
				rejection_reason: rejection_reason ?? null,
			} as UpdateBusinessDto),
		onSuccess: (data) => {
			// La lista queda con `staleTime` y sin `refetchOnWindowFocus`: sin esta
			// invalidación el badge sigue diciendo "pending" después de aprobar.
			void queryClient.invalidateQueries({ queryKey: businessesKeys.lists() });
			toast.success(
				data.verification_status === "approved"
					? "Negocio aprobado. Revisa el envío de la notificación por correo."
					: "Negocio rechazado. Revisa el envío de la notificación por correo.",
			);
		},
		onError: notifyMutationError,
	});
}
