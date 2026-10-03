/**
 * Rolé design tokens — colors.
 *
 * Design tokens for Rolé (light and dark) so visual identity is
 * identity is preserved. Tokens are the ONLY place raw hex colors live;
 * components consume them through `useTheme()`.
 */

export type ThemeScheme = "light" | "dark";

export interface ColorTokens {
	// Brand
	primary: string;
	primaryForeground: string;
	secondary: string;
	secondaryForeground: string;
	accent: string;
	accentForeground: string;

	// Surfaces
	background: string;
	foreground: string;
	card: string;
	cardForeground: string;
	popover: string;
	popoverForeground: string;
	muted: string;
	mutedForeground: string;
	border: string;
	borderSolid: string;
	ring: string;
	inputBackground: string;
	surfaceMuted: string;
	surfaceBackground: string;

	// Semantic
	destructive: string;
	destructiveForeground: string;
	destructiveVibrant: string;
	destructiveSurface: string;
	destructiveBorder: string;
	destructiveSurfaceBorder: string;
	destructiveDark: string;
	redAccent: string;
	success: string;
	successDark: string;
	/**
	 * `success` is the decorative green (washes, fills, chart series); it is not
	 * text-safe. Measured: 2.08:1 on `card` (#F7F3FB) and 2.08:1 on
	 * `surfaceSuccess` (#DCFCE7) in light — under WCAG AA 4.5:1. This token is
	 * the text-safe variant: 4.58:1 on `card`, 4.57:1 on `surfaceSuccess`,
	 * 4.82:1 on `background` in light; in dark the pair inverts, so dark
	 * `successText` is `success`: 6.13:1 on `card` (2.78:1 for `successDark`).
	 * Text and glyph foregrounds must use this one.
	 */
	successText: string;
	/**
	 * Solid green that can carry a foreground: the order flow's primary action
	 * ("validar entrega") and the OrderCard progress circles. `success`
	 * (#22C55E) under `primaryForeground` measured 2.28:1 in light — under the
	 * 3:1 non-text floor. Darkening the surface keeps the solid-fill /
	 * light-label language every other button uses: 5.02:1 in light, 7.65:1 in
	 * dark, and it lifts the fill's own separation from `card` from 2.08:1 to
	 * 4.58:1. Dark is the old `success` fill byte for byte. Always pair with
	 * `successActionForeground`, never with `primaryForeground`.
	 */
	successAction: string;
	successActionForeground: string;
	surfaceSuccess: string;
	surfaceSuccessBorder: string;
	warning: string;
	/**
	 * `warning` is the decorative amber (washes, fills, glows, status dots); it
	 * is not text-safe. Measured: 1.96:1 on `card` (#F7F3FB) in light — under
	 * WCAG AA 4.5:1 and under the 3:1 non-text floor. This token is the
	 * text-safe variant: 4.73:1 on `card`, 4.82:1 on `surfaceWarning`, 4.98:1
	 * on `background` in light; in dark the pair inverts, so dark `warningText`
	 * is `warning`: 6.50:1 on `card` (2.70:1 for `warningDark`). Text and glyph
	 * foregrounds must use this one.
	 */
	warningText: string;
	surfaceWarning: string;
	warningOrange: string;
	warningDark: string;
	surfaceWarningDark: string;
	surfaceWarningDarkBorder: string;
	info: string;
	/**
	 * `info` is the decorative teal; it is not text-safe. Measured: 3.42:1 on
	 * `card` (#F7F3FB) and 3.59:1 on `infoSurface` (#F0FDFA) in light. This
	 * token is the text-safe variant: 6.92:1 on `card`, 7.27:1 on
	 * `infoSurface`, 7.29:1 on `background` in light; dark `infoText` is
	 * `info`: 7.50:1 on `card`, 4.92:1 on `infoSurface`. Text and glyph
	 * foregrounds must use this one. Deliberately not `infoForeground` or
	 * `infoTitle`: those carry banner copy and are a different job.
	 */
	infoText: string;
	/**
	 * Solid teal that can carry a foreground: the order flow's "marcar listo".
	 * `info` (#0D9488) under `primaryForeground` measured 3.74:1 in light —
	 * under the 4.5:1 floor for its 14px label. Darkening the surface gives
	 * 7.58:1; dark is the old `info` fill byte for byte at 9.36:1. Always pair
	 * with `infoActionForeground`, never with `primaryForeground`.
	 */
	infoAction: string;
	infoActionForeground: string;
	infoSurface: string;
	infoSurfaceBorder: string;
	infoForeground: string;
	infoTitle: string;
	ecoGreen: string;
	starGold: string;

	// Status (orders)
	statusPending: string;
	statusPendingBackground: string;
	statusConfirmed: string;
	statusConfirmedBackground: string;
	statusReady: string;
	statusReadyBackground: string;
	statusPickedUp: string;
	statusPickedUpBackground: string;
	statusCompleted: string;
	statusCompletedBackground: string;
	statusCancelled: string;
	statusCancelledBackground: string;
	statusExpired: string;
	statusExpiredBackground: string;

	// Accent greens
	greenDark: string;
	greenDarkForeground: string;
	green: string;
	greenForeground: string;
	greenMidDark: string;
	greenMidDarkForeground: string;
	greenMid: string;
	greenMidForeground: string;

	// Yellows
	yellowDark: string;
	yellowDarkForeground: string;
	yellow: string;
	yellowForeground: string;
	yellowLight: string;
	yellowLightForeground: string;

	// Purples
	purpleLight: string;
	purpleLightForeground: string;
	purpleDeep: string;

	// Chart palette
	chart1: string;
	chart2: string;
	chart3: string;
	chart4: string;
	chart5: string;

	// Misc
	landingBg: string;
	navyDeep: string;
	navyDark: string;
	shadow: string;
	cardShadow: string;
	/** Base negra para velos sobre contenido (usar con withAlpha). */
	scrim: string;
	/** Blanco para texto/icono sobre cámara, mapa o foto (tema-invariante). */
	onMedia: string;
	/** Superficie de tinta para highlights monetarios (tema-invariante). */
	ink: string;
	/** QR de pickup fijo en ambos temas: el escáner necesita contraste estable. */
	qrForeground: string;
	qrBackground: string;
}

const light: ColorTokens = {
	primary: "#371949",
	primaryForeground: "#FFFFFF",
	secondary: "#DCCBF5",
	secondaryForeground: "#371949",
	accent: "#311743",
	accentForeground: "#FFFFFF",

	background: "#FBFAFD",
	foreground: "#1A1A18",
	card: "#F7F3FB",
	cardForeground: "#1A1A18",
	popover: "#FFFFFF",
	popoverForeground: "#1A1A18",
	muted: "#F7F3FB",
	mutedForeground: "#737373",
	border: "#00000014",
	borderSolid: "#E4DFEC",
	ring: "#0000001A",
	inputBackground: "#FFFFFF",
	surfaceMuted: "#F2EFF7",
	surfaceBackground: "#F7F4FB",

	destructive: "#901B35",
	destructiveForeground: "#FFFFFF",
	destructiveVibrant: "#EF4444",
	destructiveSurface: "#FEE2E2",
	destructiveBorder: "#FCA5A5",
	destructiveSurfaceBorder: "#FECACA",
	destructiveDark: "#DC2626",
	redAccent: "#FF4B4B",
	success: "#22C55E",
	successDark: "#15803D",
	successText: "#15803D",
	successAction: "#15803D",
	successActionForeground: "#FFFFFF",
	surfaceSuccess: "#DCFCE7",
	surfaceSuccessBorder: "#BBF7D0",
	warning: "#F59E0B",
	warningText: "#C2410C",
	surfaceWarning: "#FEF9C3",
	warningOrange: "#F97316",
	warningDark: "#C2410C",
	surfaceWarningDark: "#FFEDD5",
	surfaceWarningDarkBorder: "#FED7AA",
	info: "#0D9488",
	infoText: "#115E59",
	infoAction: "#115E59",
	infoActionForeground: "#FFFFFF",
	infoSurface: "#F0FDFA",
	infoSurfaceBorder: "#99F6E4",
	infoForeground: "#115E59",
	infoTitle: "#134E4A",
	ecoGreen: "#16A34A",
	starGold: "#FACC15",

	statusPending: "#F59E0B",
	statusPendingBackground: "#F59E0B33",
	statusConfirmed: "#0D9488",
	statusConfirmedBackground: "#0D948833",
	statusReady: "#22C55E",
	statusReadyBackground: "#22C55E33",
	statusPickedUp: "#6B7280",
	statusPickedUpBackground: "#00000000",
	statusCompleted: "#6366F1",
	statusCompletedBackground: "#6366F133",
	statusCancelled: "#EF4444",
	statusCancelledBackground: "#EF444433",
	statusExpired: "#EF4444",
	statusExpiredBackground: "#EF444433",

	greenDark: "#111C15",
	greenDarkForeground: "#FFFFFF",
	green: "#7CB342",
	greenForeground: "#FFFFFF",
	greenMidDark: "#233529",
	greenMidDarkForeground: "#FFFFFF",
	greenMid: "#4CAF50",
	greenMidForeground: "#FFFFFF",

	yellowDark: "#F59E0B",
	yellowDarkForeground: "#FFFFFF",
	yellow: "#FBBF24",
	yellowForeground: "#1A1A18",
	yellowLight: "#FDE68A",
	yellowLightForeground: "#1A1A18",

	purpleLight: "#B582E4",
	purpleLightForeground: "#FFFFFF",
	purpleDeep: "#6D28D9",

	chart1: "#371949",
	chart2: "#B582E4",
	chart3: "#B1CDB6",
	chart4: "#2D4142",
	chart5: "#CD9DFA",

	landingBg: "#F7F4FB",
	navyDeep: "#1D1030",
	navyDark: "#170D28",
	shadow: "#00000014",
	cardShadow: "#3719490A",
	scrim: "#000000",
	onMedia: "#FFFFFF",
	ink: "#1A1A18",
	qrForeground: "#131316",
	qrBackground: "#FFFFFF",
};

const dark: ColorTokens = {
	primary: "#B582E4",
	primaryForeground: "#1A1A18",
	secondary: "#DCCBF5",
	secondaryForeground: "#371949",
	accent: "#311743",
	accentForeground: "#FFFFFF",

	background: "#121212",
	foreground: "#FAF9F7",
	card: "#2C2C2C",
	cardForeground: "#FAF9F7",
	popover: "#2E2A38",
	popoverForeground: "#FAF9F7",
	muted: "#2E2A38",
	mutedForeground: "#9E9E9E",
	border: "#FFFFFF33",
	borderSolid: "#453E55",
	ring: "#FFFFFF33",
	inputBackground: "#2E2A38",
	surfaceMuted: "#2E2A38",
	surfaceBackground: "#121212",

	destructive: "#901B35",
	destructiveForeground: "#FFFFFF",
	destructiveVibrant: "#EF4444",
	destructiveSurface: "#EF444433",
	destructiveBorder: "#FCA5A5",
	destructiveSurfaceBorder: "#FECACA",
	destructiveDark: "#DC2626",
	redAccent: "#FF4B4B",
	success: "#22C55E",
	successDark: "#15803D",
	successText: "#22C55E",
	successAction: "#22C55E",
	successActionForeground: "#1A1A18",
	surfaceSuccess: "#22C55E33",
	surfaceSuccessBorder: "#BBF7D033",
	warning: "#F59E0B",
	warningText: "#F59E0B",
	surfaceWarning: "#FBBF2433",
	warningOrange: "#F97316",
	warningDark: "#C2410C",
	surfaceWarningDark: "#C2410C33",
	surfaceWarningDarkBorder: "#FED7AA33",
	info: "#2DD4BF",
	infoText: "#2DD4BF",
	infoAction: "#2DD4BF",
	infoActionForeground: "#1A1A18",
	infoSurface: "#2DD4BF33",
	infoSurfaceBorder: "#99F6E433",
	infoForeground: "#5EEAD4",
	infoTitle: "#99F6E4",
	ecoGreen: "#16A34A",
	starGold: "#FACC15",

	statusPending: "#F59E0B",
	statusPendingBackground: "#F59E0B33",
	statusConfirmed: "#2DD4BF",
	statusConfirmedBackground: "#2DD4BF33",
	statusReady: "#22C55E",
	statusReadyBackground: "#22C55E33",
	statusPickedUp: "#6B7280",
	statusPickedUpBackground: "#00000000",
	statusCompleted: "#818CF8",
	statusCompletedBackground: "#818CF833",
	statusCancelled: "#EF4444",
	statusCancelledBackground: "#EF444433",
	statusExpired: "#EF4444",
	statusExpiredBackground: "#EF444433",

	greenDark: "#111C15",
	greenDarkForeground: "#FFFFFF",
	green: "#7CB342",
	greenForeground: "#FFFFFF",
	greenMidDark: "#233529",
	greenMidDarkForeground: "#FFFFFF",
	greenMid: "#4CAF50",
	greenMidForeground: "#FFFFFF",

	yellowDark: "#F59E0B",
	yellowDarkForeground: "#FFFFFF",
	yellow: "#FBBF24",
	yellowForeground: "#1A1A18",
	yellowLight: "#FDE68A",
	yellowLightForeground: "#1A1A18",

	purpleLight: "#CD9DFA",
	purpleLightForeground: "#1A1A18",
	purpleDeep: "#B582E4",

	chart1: "#B582E4",
	chart2: "#CD9DFA",
	chart3: "#B1CDB6",
	chart4: "#2D4142",
	chart5: "#6D28D9",

	landingBg: "#121212",
	navyDeep: "#1D1030",
	navyDark: "#170D28",
	shadow: "#00000000",
	cardShadow: "#00000000",
	scrim: "#000000",
	onMedia: "#FFFFFF",
	ink: "#1A1A18",
	qrForeground: "#131316",
	qrBackground: "#FFFFFF",
};

/**
 * A review author's disc: the fill behind the glyph in the review list.
 *
 * A deterministic colour derived from `reviews.user_id` (see
 * `authorPaletteIndex`). It is the identity signal for a review author,
 * because the author NAME is usually not readable by the viewer: `profiles`
 * has no policy that lets one consumer read another consumer's row, so the
 * review feed falls back to "Cliente" for everyone. The colour is derived from
 * data the feed already exposes (`author_id` is already public in
 * `PublicReviewItemSchema`), so this widens no contract.
 *
 * A pair, not a bare colour: the glyph sits ON the fill, so the two have to be
 * measured together, and a fill that carries no foreground cannot be audited
 * with the same criteria. Both schemes are asserted by
 * `author-palette.contrast.test.ts`: `on` over `fill` at the 4.5:1 text floor,
 * `fill` against the surfaces the disc is painted on at the 3:1 non-text floor,
 * AND a CIELAB separation floor between every pair of fills — contrast alone
 * does not catch two discs that pass every ratio and still look like the same
 * colour, which is the whole point of the palette.
 *
 * The 16 were picked by search, not by hand: a grid over CIELAB lightness,
 * chroma and hue, filtered to colours that clear the contrast floors, then
 * farthest-point
 * selection maximising the minimum pairwise ΔE. Chroma is floored at 34 so the
 * result stays vivid — without that floor the search maximises separation by
 * drifting toward grey. Achieved minimum ΔE: 27.4 light, 27.9 dark, against a
 * floor of 25. Roughly, ΔE below ~10 is invisible and ~25 is an obvious
 * difference at a glance, so every pair here is meant to be tellable apart.
 *
 * NOT `ColorTokens`: that interface is a flat record of one colour per job, and
 * a palette is a set. `ColorTokens` is untouched, so the decorative-hue purity
 * guards (`semantic-text.purity.test.ts`, `success-text.purity.test.ts`) do
 * not apply here — these are deliberately saturated fills, not text-safe hues.
 *
 * Dark is not the light palette darkened: on a dark `card` those fills measure
 * 2.0-2.8:1 and vanish, so dark carries lighter fills under the ink foreground.
 *
 * CHANGING EITHER LIST RECOLOURS AUTHORS. The slot is `hash % length`, so the
 * length is part of the contract, not a detail. 8 -> 16 moves roughly half of
 * them.
 */
export interface AuthorPaletteEntry {
	/** The disc. Also the disc's own separation from the surface behind it. */
	fill: string;
	/** The glyph on the disc: the text-safe foreground for this fill. */
	on: string;
}

/**
 * A palette with at least one entry, encoded in the type.
 *
 * `authorDisc` falls back to the first slot, so "never empty" is an invariant
 * the palette has to carry — as a type, not as a comment next to a `!`.
 */
export type AuthorPalette = readonly [
	AuthorPaletteEntry,
	...AuthorPaletteEntry[],
];

export const authorPalette: Record<ThemeScheme, AuthorPalette> = {
	light: [
		{ fill: "#831E1E", on: "#FFFFFF" },
		{ fill: "#2D6BF4", on: "#FFFFFF" },
		{ fill: "#088804", on: "#FFFFFF" },
		{ fill: "#057F9C", on: "#FFFFFF" },
		{ fill: "#D320A4", on: "#FFFFFF" },
		{ fill: "#38154D", on: "#FFFFFF" },
		{ fill: "#0C2C01", on: "#FFFFFF" },
		{ fill: "#8E7106", on: "#FFFFFF" },
		{ fill: "#E5045D", on: "#FFFFFF" },
		{ fill: "#AC5984", on: "#FFFFFF" },
		{ fill: "#D14403", on: "#FFFFFF" },
		{ fill: "#028560", on: "#FFFFFF" },
		{ fill: "#640897", on: "#FFFFFF" },
		{ fill: "#676FB6", on: "#FFFFFF" },
		{ fill: "#583A13", on: "#FFFFFF" },
		{ fill: "#416000", on: "#FFFFFF" },
	],
	dark: [
		{ fill: "#C06C63", on: "#1A1A18" },
		{ fill: "#517AFF", on: "#1A1A18" },
		{ fill: "#8EFF74", on: "#1A1A18" },
		{ fill: "#82DBFA", on: "#1A1A18" },
		{ fill: "#FE54CB", on: "#1A1A18" },
		{ fill: "#E7B8FD", on: "#1A1A18" },
		{ fill: "#648F57", on: "#1A1A18" },
		{ fill: "#ECBE08", on: "#1A1A18" },
		{ fill: "#FB256B", on: "#1A1A18" },
		{ fill: "#D36BA1", on: "#1A1A18" },
		{ fill: "#FE6A2D", on: "#1A1A18" },
		{ fill: "#7AFDC9", on: "#1A1A18" },
		{ fill: "#C46CF7", on: "#1A1A18" },
		{ fill: "#757ECA", on: "#1A1A18" },
		{ fill: "#FED2A4", on: "#1A1A18" },
		{ fill: "#71A205", on: "#1A1A18" },
	],
};

export const colorTokens: Record<ThemeScheme, ColorTokens> = { light, dark };
export { light, dark };
