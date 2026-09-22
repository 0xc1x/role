/**
 * Marca de Rolé.
 *
 * SINGLE SOURCE OF TRUTH: el artwork vive en
 * `packages/commons/src/brand/assets/{icon,wordmark}.svg` y se compila a
 * `@0xc1x/role-commons` con `bun run brand:sync`. No edites el SVG aquí.
 */

import {
	BRAND_PRIMARY,
	MARK_R_D,
	MARK_R_TRANSFORM,
	MARK_R_VIEWBOX,
	WORDMARK_INNER,
	WORDMARK_MONO_INNER,
	WORDMARK_VIEWBOX,
} from "@0xc1x/role-commons";

type LogoProps = React.SVGProps<SVGSVGElement>;

/**
 * `mono` renderiza la variante monocroma (todos los fills en currentColor)
 * para que la app la tinte con clases `text-*`. Útil sobre fondos oscuros.
 */
export function Wordmark({
	className,
	mono = false,
	...props
}: LogoProps & { mono?: boolean }) {
	return (
		<svg
			viewBox={WORDMARK_VIEWBOX}
			className={className}
			aria-hidden="true"
			focusable={false}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static brand asset compiled from packages/commons/src/brand
			dangerouslySetInnerHTML={{
				__html: mono ? WORDMARK_MONO_INNER : WORDMARK_INNER,
			}}
			{...props}
		/>
	);
}

export function LogoMark({ className, fill = BRAND_PRIMARY, ...props }: LogoProps) {
	return (
		<svg
			viewBox={MARK_R_VIEWBOX}
			className={className}
			aria-hidden="true"
			focusable={false}
			{...props}
		>
			<path
				d={MARK_R_D}
				transform={MARK_R_TRANSFORM ?? undefined}
				fill={fill}
			/>
		</svg>
	);
}
