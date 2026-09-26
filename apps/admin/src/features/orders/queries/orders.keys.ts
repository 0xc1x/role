export const ordersKeys = {
	all: ["orders"] as const,
	lists: () => [...ordersKeys.all, "list"] as const,
	list: (params: unknown) => [...ordersKeys.lists(), params] as const,
	details: () => [...ordersKeys.all, "detail"] as const,
	detail: (id: string) => [...ordersKeys.details(), id] as const,
};
