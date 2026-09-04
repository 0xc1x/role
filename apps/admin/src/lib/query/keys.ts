export function createResourceKeys<TParams>(name: string) {
	return {
		all: [name] as const,
		lists: () => [name, "list"] as const,
		list: (params?: TParams) =>
			[name, "list", (params ?? {}) as Partial<TParams>] as const,
		details: () => [name, "detail"] as const,
		detail: (id: string) => [name, "detail", id] as const,
	};
}

export function createListOnlyKeys<TParams>(name: string) {
	return {
		all: [name] as const,
		lists: () => [name, "list"] as const,
		list: (params?: TParams) =>
			[name, "list", (params ?? {}) as Partial<TParams>] as const,
	};
}
