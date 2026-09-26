import type {
	BusinessVerificationStatus,
	CreateBusinessDto,
	ListBusinessesQuery,
	UpdateBusinessDto,
} from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { businessesApi } from "../api/businesses.api";
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

/** Error de mutación → toast. Pura y sin closure: vive a nivel módulo. */
function notifyMutationError(err: Error) {
	toast.error(err.message);
}

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
