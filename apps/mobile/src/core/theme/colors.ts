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
	destructiveVibrant: string;
	destructiveSurface: string;
	destructiveBorder: string;
	destructiveSurfaceBorder: string;
	destructiveDark: string;
	redAccent: string;
	success: string;
	successDark: string;
	surfaceSuccess: string;
	surfaceSuccessBorder: string;
	warning: string;
	surfaceWarning: string;
	warningOrange: string;
	warningDark: string;
	surfaceWarningDark: string;
	surfaceWarningDarkBorder: string;
	info: string;
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
}

const light: ColorTokens = {
	primary: "#BF1C19",
	primaryForeground: "#FFFFFF",
	secondary: "#96BF85",
	secondaryForeground: "#1A1A18",
	accent: "#435D38",
	accentForeground: "#FFFFFF",

	background: "#FAF9F7",
	foreground: "#1A1A18",
	card: "#FFF5F5",
	cardForeground: "#1A1A18",
	muted: "#FFF5F5",
	mutedForeground: "#737373",
	border: "#00000014",
	borderSolid: "#E5E5E5",
	ring: "#0000001A",
	inputBackground: "#FFFFFF",
	surfaceMuted: "#F1F5F9",
	surfaceBackground: "#F8FAFC",

	destructive: "#901B35",
	destructiveVibrant: "#EF4444",
	destructiveSurface: "#FEE2E2",
	destructiveBorder: "#FCA5A5",
	destructiveSurfaceBorder: "#FECACA",
	destructiveDark: "#DC2626",
	redAccent: "#FF4B4B",
	success: "#22C55E",
	successDark: "#15803D",
	surfaceSuccess: "#DCFCE7",
	surfaceSuccessBorder: "#BBF7D0",
	warning: "#F59E0B",
	surfaceWarning: "#FEF9C3",
	warningOrange: "#F97316",
	warningDark: "#C2410C",
	surfaceWarningDark: "#FFEDD5",
	surfaceWarningDarkBorder: "#FED7AA",
	info: "#0D9488",
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

	purpleLight: "#A398DA",
	purpleLightForeground: "#FFFFFF",
	purpleDeep: "#725EFE",

	chart1: "#BF1C19",
	chart2: "#725EFE",
	chart3: "#B1CDB6",
	chart4: "#2D4142",
	chart5: "#A398DA",

	landingBg: "#F8F9FA",
	navyDeep: "#05102F",
	navyDark: "#04102D",
	shadow: "#00000014",
	cardShadow: "#FA47430A",
};

const dark: ColorTokens = {
	primary: "#BF1C19",
	primaryForeground: "#FFFFFF",
	secondary: "#96BF85",
	secondaryForeground: "#1A1A18",
	accent: "#435D38",
	accentForeground: "#FFFFFF",

	background: "#121212",
	foreground: "#FAF9F7",
	card: "#2C2C2C",
	cardForeground: "#FAF9F7",
	muted: "#2C2C2C",
	mutedForeground: "#9E9E9E",
	border: "#FFFFFF33",
	borderSolid: "#3D3D3D",
	ring: "#FFFFFF33",
	inputBackground: "#2C2C2C",
	surfaceMuted: "#333333",
	surfaceBackground: "#121212",

	destructive: "#901B35",
	destructiveVibrant: "#EF4444",
	destructiveSurface: "#EF444433",
	destructiveBorder: "#FCA5A5",
	destructiveSurfaceBorder: "#FECACA",
	destructiveDark: "#DC2626",
	redAccent: "#FF4B4B",
	success: "#22C55E",
	successDark: "#15803D",
	surfaceSuccess: "#22C55E33",
	surfaceSuccessBorder: "#BBF7D033",
	warning: "#F59E0B",
	surfaceWarning: "#FBBF2433",
	warningOrange: "#F97316",
	warningDark: "#C2410C",
	surfaceWarningDark: "#C2410C33",
	surfaceWarningDarkBorder: "#FED7AA33",
	info: "#2DD4BF",
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

	purpleLight: "#A398DA",
	purpleLightForeground: "#FFFFFF",
	purpleDeep: "#725EFE",

	chart1: "#BF1C19",
	chart2: "#725EFE",
	chart3: "#B1CDB6",
	chart4: "#2D4142",
	chart5: "#A398DA",

	landingBg: "#121212",
	navyDeep: "#05102F",
	navyDark: "#04102D",
	shadow: "#00000000",
	cardShadow: "#00000000",
};

export const colorTokens: Record<ThemeScheme, ColorTokens> = { light, dark };
export { light, dark };
