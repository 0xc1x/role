import type {
	CreateBusinessDto,
	ListBusinessesQuery,
	UpdateBusinessDto,
} from "@0xc1x/role-commons";
import { useMutation, useQuery } from "@tanstack/react-query";
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
	return useMutation({
		mutationFn: ({
			id,
			verification_status,
			rejection_reason,
		}: {
			id: string;
			verification_status: "approved" | "rejected" | "pending";
			rejection_reason?: string | null;
		}) =>
			businessesApi.update(id, {
				verification_status,
				rejection_reason: rejection_reason ?? null,
			} as UpdateBusinessDto),
	});
}
