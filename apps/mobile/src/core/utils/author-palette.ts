/**
 * Which palette entry a review author gets.
 *
 * The seed is the author's `user_id`, so the same author is the same colour on
 * every review, on every device, forever — with nothing stored. That matters
 * because it is the ONLY stable identity a viewer has: `profiles` has no policy
 * letting one consumer read another consumer's row, so the review feed renders
 * "Cliente" for nearly every author.
 *
 * `user_id` is public already — `PublicReviewItemSchema` ships `author_id`
 * with the same value — so this reads data the product has already published
 * rather than widening a contract.
 */

/** FNV-1a, 32-bit. Chosen for being short, stable across JS engines, and not a cryptographic hash. */
function fnv1a(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		// `Math.imul` keeps this in int32 instead of growing past 2^53.
		hash = Math.imul(hash, 0x01000193);
	}
	// The `>>> 0` turns the signed int32 into the unsigned range, so a negative
	// hash can never become a negative array index.
	return hash >>> 0;
}

/**
 * The palette slot for `seed`, for a palette of `size` entries.
 *
 * `size` is the palette length rather than a constant so this cannot drift out
 * of sync with `authorPalette`: every scheme is the same length, and passing
 * the wrong one is a wrong colour, not a crash — hence the clamp, not an assert.
 */
export function authorPaletteIndex(seed: string, size: number): number {
	if (size <= 0) return 0;
	return fnv1a(seed) % size;
}
