export function pickDefined<T extends Record<string, unknown>>(
	dto: T,
	keys: (keyof T)[],
): Partial<T> {
	const out: Partial<T> = {};
	for (const k of keys) {
		if (dto[k] !== undefined) out[k] = dto[k];
	}
	return out;
}
