/**
 * Manifest of every file generated from the brand single source of truth.
 * `scripts/sync-brand-assets.mjs` iterates this list; the test below asserts
 * no entry is lost silently.
 */
export interface BrandTarget {
	/** Repo-relative destination, e.g. `apps/admin/public/icon.svg`. */
	file: string;
	/** Which canonical asset this file carries. */
	treatment: "transparent-icon" | "wordmark-file";
}

export const BRAND_TARGETS: BrandTarget[] = [
	{ file: "apps/admin/public/icon.svg", treatment: "transparent-icon" },
	{ file: "apps/landing/public/icon.svg", treatment: "transparent-icon" },
	{
		file: "apps/mobile/assets/svgs/role_wordmark.svg",
		treatment: "wordmark-file",
	},
	{ file: "apps/landing/public/wordmark.svg", treatment: "wordmark-file" },
	{ file: "apps/admin/public/wordmark.svg", treatment: "wordmark-file" },
];
