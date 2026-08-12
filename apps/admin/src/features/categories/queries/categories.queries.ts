import type {
	CreateCategoryDto,
	ListCategoriesQuery,
	UpdateCategoryDto,
} from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { categoriesApi } from "../api/categories.api";
import { categoriesKeys } from "./categories.keys";

export const categoriesListOptions = (params?: ListCategoriesQuery) =>
	queryOptions({
		queryKey: categoriesKeys.list(params),
		queryFn: () => categoriesApi.list(params),
		staleTime: 30_000,
	});

export function useCategoriesList(params?: ListCategoriesQuery) {
	return useQuery(categoriesListOptions(params));
}

export function useCreateCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: categoriesKeys.all,
		mutationFn: (body: CreateCategoryDto) => categoriesApi.create(body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: categoriesKeys.lists() });
		},
	});
}

export function useUpdateCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: categoriesKeys.all,
		mutationFn: ({ id, body }: { id: string; body: UpdateCategoryDto }) =>
			categoriesApi.update(id, body),
		onSuccess: (data) => {
			void qc.invalidateQueries({ queryKey: categoriesKeys.lists() });
			qc.setQueryData(categoriesKeys.detail(data.id), data);
		},
	});
}

export function useUploadImage() {
	return useMutation({
		mutationFn: (file: File) => categoriesApi.uploadImage(file),
	});
}

export function useDeleteCategory() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: categoriesKeys.all,
		mutationFn: (id: string) => categoriesApi.remove(id),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: categoriesKeys.all });
		},
	});
}
