export const emailKeys = {
	all: ["email"] as const,
	list: (resource: string, q?: Record<string, unknown>) =>
		[...emailKeys.all, resource, q] as const,
};
