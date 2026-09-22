import {
	MARK_FULL_INNER,
	MARK_FULL_VIEWBOX,
	WORDMARK_MONO_INNER,
	WORDMARK_VIEWBOX,
} from "@0xc1x/role-commons";
import type * as React from "react";
import { cn } from "@/lib/utils";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
	variant?: "icon" | "wordmark";
	size?: number | string;
}

/**
 * Marca de Rolé.
 *
 * SINGLE SOURCE OF TRUTH: el artwork vive en
 * `packages/commons/src/brand/assets/{icon,wordmark}.svg` y se compila a
 * `@0xc1x/role-commons` con `bun run brand:sync`. No edites el SVG aquí.
 */
export function Logo({
	variant = "icon",
	size,
	className,
	...props
}: LogoProps) {
	if (variant === "wordmark") {
		const height = size !== undefined ? Number(size) : 36;
		const width = Math.round(height * 2); // ratio del wordmark 754:377

		// Monocromático: hereda el color del texto (ej. text-sidebar-foreground).
		return (
			<svg
				width={width}
				height={height}
				viewBox={WORDMARK_VIEWBOX}
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
				className={cn("shrink-0", className)}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static brand asset compiled from packages/commons/src/brand
				dangerouslySetInnerHTML={{ __html: WORDMARK_MONO_INNER }}
				{...props}
			/>
		);
	}

	// ==================== MARK ====================
	// Marca completa: R + destellos, sin tile (tratamiento transparente del
	// canonical icon.svg). La R hereda currentColor — cada uso la tiñe con
	// text-* — y los destellos conservan BRAND_ACCENT_LIGHT.
	// Cuadrado + meet: nunca se recorta al contraer la barra, la marca queda
	// centrada con letterbox.
	const iconSize = size !== undefined ? Number(size) : 32;

	return (
		<svg
			width={iconSize}
			height={iconSize}
			viewBox={MARK_FULL_VIEWBOX}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			preserveAspectRatio="xMidYMid meet"
			className={cn("shrink-0", className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static brand asset compiled from packages/commons/src/brand
			dangerouslySetInnerHTML={{ __html: MARK_FULL_INNER }}
			{...props}
		/>
	);
}
