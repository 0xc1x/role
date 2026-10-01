import { WORDMARK_MONO_INNER, WORDMARK_INNER, WORDMARK_VIEWBOX } from "@0xc1x/role-commons";
import { SvgXml } from "react-native-svg";

import { useTheme } from "@/src/core/theme";

/**
 * Wordmark de Rolé.
 *
 * SINGLE SOURCE OF TRUTH: el artwork vive en
 * `packages/commons/src/brand/assets/wordmark.svg` y se compila a
 * `@0xc1x/role-commons` con `bun run brand:sync`. No edites el SVG aquí.
 *
 * La variante `mono` usa `WORDMARK_MONO_INNER` (fills en `currentColor`,
 * mismo patrón que `Wordmark` en landing) para superficies oscuras.
 */
const BRAND_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}">${WORDMARK_INNER}</svg>`;
const MONO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}">${WORDMARK_MONO_INNER}</svg>`;

type LogoProps = {
	width?: number;
	height?: number;
	/** Monocromo (tintable). Por defecto sigue el scheme: blanco en dark. */
	mono?: boolean;
	/** Tinta de la variante mono. Por defecto blanca. */
	color?: string;
};

export function Logo({ width, height, mono, color = "#FFFFFF" }: LogoProps) {
	const { scheme } = useTheme();
	const isMono = mono ?? scheme === "dark";
	return (
		<SvgXml
			xml={isMono ? MONO_XML : BRAND_XML}
			width={width}
			height={height}
			color={isMono ? color : undefined}
		/>
	);
}
