import type {
	CategoryDto,
	CategoryPaginatedData,
	CreateCategoryDto,
	ListCategoriesQuery,
	UpdateCategoryDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { createResourceApi } from "@/lib/api/resource";

const base = createResourceApi<
	CategoryDto,
	CreateCategoryDto,
	UpdateCategoryDto,
	ListCategoriesQuery,
	CategoryPaginatedData
>("/categories");

export const categoriesApi = {
	...base,
	uploadImage: (file: File) => {
		const formData = new FormData();
		formData.append("file", file);
		return api.post<{ url: string }>("/upload/image", undefined, {
			formData,
		});
	},
};
