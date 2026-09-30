export const reviewsKeys = {
	all: ["reviews"] as const,
	lists: () => [...reviewsKeys.all, "list"] as const,
	list: (params: unknown) => [...reviewsKeys.lists(), params] as const,
};
