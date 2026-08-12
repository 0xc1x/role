/** Coerce Postgres numeric / string / number to JS number. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toNumberOrNull(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}
