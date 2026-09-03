export function toSearchParams(query?: Record<string, unknown>): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		params.set(key, String(value as string | number | boolean));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}
