export const statsKeys = {
	all: ["stats"] as const,
	platform: () => [...statsKeys.all, "platform"] as const,
	// El período va en la key: dos ventanas distintas son dos reportes
	// distintos, no uno refrescado.
	revenue: (query?: unknown) =>
		[...statsKeys.all, "revenue", query ?? {}] as const,
};
