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

/**
 * Money to the scale of the columns that hold it: `numeric(12,2)` everywhere in
 * `orders`, `business_finance` and `payments`.
 *
 * Needed because JS money arithmetic is unrounded: 50% of 3990 is 1329.8670000…
 * The database rounds that on write, so anything the API shows a user has to
 * round the same way or the checkout screen and the receipt disagree by a
 * fraction of a cent. One definition, so the two cannot drift.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
