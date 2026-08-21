import type {
	CreateAppConfigDto,
	ListAppConfigQuery,
	UpdateAppConfigDto,
} from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { appConfigApi } from "../api/app-config.api";
import { appConfigKeys } from "./app-config.keys";

export const appConfigListOptions = (params?: ListAppConfigQuery) =>
	queryOptions({
		queryKey: appConfigKeys.list(params),
		queryFn: () => appConfigApi.list(params),
		staleTime: 30_000,
	});

export function useAppConfigList(params?: ListAppConfigQuery) {
	return useQuery(appConfigListOptions(params));
}

export function useCreateAppConfig() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: appConfigKeys.all,
		mutationFn: (body: CreateAppConfigDto) => appConfigApi.create(body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: appConfigKeys.lists() });
		},
	});
}

export function useUpdateAppConfig() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: appConfigKeys.all,
		mutationFn: ({ key, body }: { key: string; body: UpdateAppConfigDto }) =>
			appConfigApi.update(key, body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: appConfigKeys.lists() });
		},
	});
}

export function useDeleteAppConfig() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: appConfigKeys.all,
		mutationFn: (key: string) => appConfigApi.remove(key),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: appConfigKeys.lists() });
		},
	});
}
