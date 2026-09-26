export const businessesKeys = {
	all: ["businesses"] as const,
	lists: () => [...businessesKeys.all, "list"] as const,
	list: (params: unknown) => [...businessesKeys.lists(), params] as const,
	details: () => [...businessesKeys.all, "detail"] as const,
	detail: (id: string) => [...businessesKeys.details(), id] as const,
	emailSends: (id: string) =>
		[...businessesKeys.detail(id), "email-sends"] as const,
	locations: (id: string) =>
		[...businessesKeys.detail(id), "locations"] as const,
};
