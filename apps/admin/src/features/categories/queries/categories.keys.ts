import type { ListCategoriesQuery } from "@0xc1x/role-commons";

export const categoriesKeys = {
	all: ["categories"] as const,
	lists: () => [...categoriesKeys.all, "list"] as const,
	list: (params?: ListCategoriesQuery) =>
		[...categoriesKeys.lists(), params ?? {}] as const,
	details: () => [...categoriesKeys.all, "detail"] as const,
	detail: (id: string) => [...categoriesKeys.details(), id] as const,
};
