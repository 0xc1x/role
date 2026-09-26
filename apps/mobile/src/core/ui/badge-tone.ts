import type { ColorTokens } from "@/src/core/theme/colors";

export type BadgeTone =
	| "neutral"
	| "brand"
	| "success"
	| "warning"
	| "danger"
	| "info";

/**
 * Shared BadgeTone → color mapping (tokens, dark-safe). Single source of truth
 * for `StatusBadge` and any other tone-driven pill.
 *
 * IMPORT BY LEAF PATH — `@/src/core/ui/badge-tone`, NOT the `@/src/core/ui`
 * barrel, and do not re-export this from the barrel. Many tests stub the
 * barrel with a partial `mock.module`, and bun's nominal-import check fails the
 * moment a component pulls a value the stub doesn't declare. A `type` re-export
 * is harmless (types are erased); a value re-export is not. `AppText`,
 * `SegmentedTabs`, `Navbar` and `InfoScreen` are consumed the same way.
 *
 * The lookup is a `Record<BadgeTone, …>` on purpose: its exhaustiveness is what
 * makes `tsc` fail at compile time when a new tone is added to the union. Do NOT
 * rewrite it as a `switch` with a `default` branch — that silently accepts an
 * unhandled tone and throws the guarantee away.
 */
export function badgeToneColors(
	colors: ColorTokens,
	tone: BadgeTone,
): { bg: string; fg: string } {
	const map: Record<BadgeTone, { bg: string; fg: string }> = {
		neutral: { bg: colors.muted, fg: colors.mutedForeground },
		brand: { bg: colors.secondary, fg: colors.secondaryForeground },
		success: { bg: colors.surfaceSuccess, fg: colors.successText },
		warning: { bg: colors.surfaceWarning, fg: colors.warningText },
		danger: { bg: colors.destructiveSurface, fg: colors.destructive },
		info: { bg: colors.infoSurface, fg: colors.infoText },
	};
	return map[tone];
}
