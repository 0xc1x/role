export const contactInboxKeys = {
	all: ["contact-inbox"] as const,
	lists: () => [...contactInboxKeys.all, "list"] as const,
	list: (params: unknown) => [...contactInboxKeys.lists(), params] as const,
	details: () => [...contactInboxKeys.all, "detail"] as const,
	detail: (id: string) => [...contactInboxKeys.details(), id] as const,
};
