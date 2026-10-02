import { WORDMARK_MONO_SVG, WORDMARK_SVG } from "@0xc1x/role-commons";
import { SvgXml } from "react-native-svg";

import { useTheme } from "@/src/core/theme";

/**
 * Wordmark de Rolé.
 *
 * SINGLE SOURCE OF TRUTH: el artwork vive en
 * `packages/commons/src/brand/assets/wordmark.svg` y se compila a
 * `@0xc1x/role-commons` con `bun run brand:sync`. No edites el SVG aquí:
 * este componente solo elige variante (`WORDMARK_SVG` morados por defecto,
 * `WORDMARK_MONO_SVG` en `currentColor` para superficies oscuras, mismo
 * patrón que `Wordmark` en landing).
 */

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
			xml={isMono ? WORDMARK_MONO_SVG : WORDMARK_SVG}
			width={width}
			height={height}
			color={isMono ? color : undefined}
		/>
	);
}
