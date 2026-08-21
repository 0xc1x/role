import type { ListAppConfigQuery } from "@0xc1x/role-commons";

export const appConfigKeys = {
	all: ["app-config"] as const,
	lists: () => [...appConfigKeys.all, "list"] as const,
	list: (params?: ListAppConfigQuery) =>
		[...appConfigKeys.lists(), params] as const,
};
