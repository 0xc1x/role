import type { ListCommissionsQuery } from "@0xc1x/role-commons";

export const commissionsKeys = {
	all: ["commissions"] as const,
	lists: () => [...commissionsKeys.all, "list"] as const,
	list: (params?: ListCommissionsQuery) =>
		[...commissionsKeys.lists(), params ?? {}] as const,
	details: () => [...commissionsKeys.all, "detail"] as const,
	detail: (id: string) => [...commissionsKeys.details(), id] as const,
};
