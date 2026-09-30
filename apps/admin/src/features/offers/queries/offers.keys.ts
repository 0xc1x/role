export const offersKeys = {
	all: ["offers"] as const,
	lists: () => [...offersKeys.all, "list"] as const,
	list: (params: unknown) => [...offersKeys.lists(), params] as const,
	details: () => [...offersKeys.all, "detail"] as const,
	detail: (id: string) => [...offersKeys.details(), id] as const,
};
