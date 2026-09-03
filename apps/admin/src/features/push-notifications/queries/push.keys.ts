export const pushKeys = {
	all: ["push"] as const,
	lists: () => [...pushKeys.all, "list"] as const,
	list: (resource: string, params: unknown) =>
		[...pushKeys.lists(), resource, params] as const,
	details: () => [...pushKeys.all, "detail"] as const,
	detail: (id: string) => [...pushKeys.details(), id] as const,
};
