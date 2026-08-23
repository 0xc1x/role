export const payoutsKeys = {
	all: ["payouts"] as const,
	lists: () => [...payoutsKeys.all, "list"] as const,
	list: (params?: unknown) => [...payoutsKeys.lists(), params] as const,
};
