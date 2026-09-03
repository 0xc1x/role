import type { ListCategoriesQuery } from "@0xc1x/role-commons";
import { createResourceKeys } from "@/lib/query/keys";

export const categoriesKeys =
	createResourceKeys<ListCategoriesQuery>("categories");
