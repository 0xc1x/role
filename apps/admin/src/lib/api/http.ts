export function toSearchParams(
	query?: Record<string, string | number | boolean | null | undefined>,
): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}
