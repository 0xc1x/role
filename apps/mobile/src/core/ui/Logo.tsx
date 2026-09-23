import { WORDMARK_VIEWBOX, WORDMARK_INNER } from "@0xc1x/role-commons";
import { SvgXml } from "react-native-svg";

/**
 * Wordmark de Rolé.
 *
 * SINGLE SOURCE OF TRUTH: el artwork vive en
 * `packages/commons/src/brand/assets/wordmark.svg` y se compila a
 * `@0xc1x/role-commons` con `bun run brand:sync`. No edites el SVG aquí.
 */
const WORDMARK_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}">${WORDMARK_INNER}</svg>`;

type LogoProps = {
	width?: number;
	height?: number;
};

export function Logo({ width, height }: LogoProps) {
	return <SvgXml xml={WORDMARK_XML} width={width} height={height} />;
}
