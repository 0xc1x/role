export const statsKeys = {
	all: ["stats"] as const,
	platform: () => [...statsKeys.all, "platform"] as const,
};
