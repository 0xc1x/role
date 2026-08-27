import type {
	CreateCategoryDto,
	ListCategoriesQuery,
	UpdateCategoryDto,
} from "@0xc1x/role-commons";
import { useMutation } from "@tanstack/react-query";
import { categoriesApi } from "../api/categories.api";
import { categoriesKeys } from "./categories.keys";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { useQuery } from "@tanstack/react-query";

export const categoriesListOptions = createListOptions(
	categoriesKeys,
	categoriesApi.list,
);

export function useCategoriesList(params?: ListCategoriesQuery) {
	return useQuery(categoriesListOptions(params));
}

export const useCreateCategory = createUseCreate<
	CreateCategoryDto,
	Awaited<ReturnType<typeof categoriesApi.create>>
>(categoriesKeys, categoriesApi.create);

export const useUpdateCategory = createUseUpdate<
	UpdateCategoryDto,
	Awaited<ReturnType<typeof categoriesApi.update>>
>(categoriesKeys, categoriesApi.update);

export function useUploadImage() {
	return useMutation({
		mutationFn: (file: File) => categoriesApi.uploadImage(file),
	});
}

export const useDeleteCategory = createUseDelete(
	categoriesKeys,
	categoriesApi.remove,
);
