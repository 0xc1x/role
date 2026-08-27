import {
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";

export function createListOptions<TParams, TData>(
	keys: { list: (p?: TParams) => readonly unknown[] },
	apiList: (params?: TParams) => Promise<TData>,
) {
	return (params?: TParams) =>
		queryOptions({
			queryKey: keys.list(params),
			queryFn: () => apiList(params),
			staleTime: 30_000,
		});
}

export function createUseCreate<TBody, TData>(
	keys: { all: readonly unknown[]; lists: () => readonly unknown[] },
	apiCreate: (body: TBody) => Promise<TData>,
) {
	return () => {
		const qc = useQueryClient();
		return useMutation({
			mutationKey: keys.all as unknown as readonly unknown[],
			mutationFn: (body: TBody) => apiCreate(body),
			onSuccess: () => {
				void qc.invalidateQueries({ queryKey: keys.lists() });
			},
		});
	};
}

export function createUseUpdate<TBody, TData extends { id: string }>(
	keys: {
		all: readonly unknown[];
		lists: () => readonly unknown[];
		detail: (id: string) => readonly unknown[];
	},
	apiUpdate: (id: string, body: TBody) => Promise<TData>,
) {
	return () => {
		const qc = useQueryClient();
		return useMutation({
			mutationKey: keys.all as unknown as readonly unknown[],
			mutationFn: ({ id, body }: { id: string; body: TBody }) =>
				apiUpdate(id, body),
			onSuccess: (data) => {
				void qc.invalidateQueries({ queryKey: keys.lists() });
				qc.setQueryData(keys.detail(data.id), data);
			},
		});
	};
}

export function createUseDelete(
	keys: { all: readonly unknown[] },
	apiRemove: (id: string) => Promise<unknown>,
) {
	return () => {
		const qc = useQueryClient();
		return useMutation({
			mutationKey: keys.all as unknown as readonly unknown[],
			mutationFn: (id: string) => apiRemove(id),
			onSuccess: () => {
				void qc.invalidateQueries({ queryKey: keys.all as unknown as readonly unknown[] });
			},
		});
	};
}
