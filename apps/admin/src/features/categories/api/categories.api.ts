import type {
	CategoryDto,
	CategoryPaginatedData,
	CreateCategoryDto,
	ListCategoriesQuery,
	UpdateCategoryDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const categoriesApi = {
	list: (query?: ListCategoriesQuery) =>
		api.get<CategoryPaginatedData>(
			`/categories${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
		),

	getById: (id: string) => api.get<CategoryDto>(`/categories/${id}`),

	create: (body: CreateCategoryDto) =>
		api.post<CategoryDto>("/categories", body),

	update: (id: string, body: UpdateCategoryDto) =>
		api.patch<CategoryDto>(`/categories/${id}`, body),

	remove: (id: string) => api.delete<CategoryDto>(`/categories/${id}`),

	uploadImage: (file: File) => {
		const formData = new FormData();
		formData.append("file", file);
		return api.post<{ url: string }>("/upload/image", undefined, {
			formData,
		});
	},
};
