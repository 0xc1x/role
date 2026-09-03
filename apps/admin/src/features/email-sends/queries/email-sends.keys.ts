export const emailSendsKeys = {
	all: ["email-sends"] as const,
	lists: () => [...emailSendsKeys.all, "list"] as const,
	list: (params: unknown) => [...emailSendsKeys.lists(), params] as const,
	details: () => [...emailSendsKeys.all, "detail"] as const,
	detail: (id: string) => [...emailSendsKeys.details(), id] as const,
};
