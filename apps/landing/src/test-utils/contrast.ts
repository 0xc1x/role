/**
 * WCAG 2.1 contrast helpers for the landing token contrast specs.
 *
 * Mismo algoritmo que `apps/mobile/src/test-utils/contrast.ts` (luminancia
 * relativa de WCAG, ratio (L_claro + 0.05) / (L_oscuro + 0.05), y canales alpha
 * compuestos sobre el fondo opaco que el navegador mostraría). Vive duplicado
 * porque los dos paquetes no se importan entre sí: la app no depende de mobile
 * y mobile no depende de la landing. Si alguna vez los dos necesitan medir
 * color, el destino es `packages/commons`, no una tercera copia.
 */

/** WCAG 2.1 relative luminance: 0.2126R + 0.7152G + 0.0722B, linearised. */
export function luminance(hex: string): number {
	const value = hex.replace("#", "").slice(0, 6);
	const channels = [0, 2, 4].map((offset) => {
		const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return (
		0.2126 * (channels[0] as number) +
		0.7152 * (channels[1] as number) +
		0.0722 * (channels[2] as number)
	);
}

/** WCAG 2.1 contrast ratio between two opaque colours. */
export function contrast(a: string, b: string): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort(
		(x, y) => y - x,
	) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

/** Flattens `#RRGGBBAA` over an opaque backdrop the way the browser does. */
export function compositeOver(top: string, bottom: string): string {
	const read = (hex: string, offset: number) =>
		parseInt(hex.replace("#", "").slice(offset, offset + 2), 16);
	const alpha = read(top, 6) / 255;
	const channel = (offset: number) =>
		Math.round(read(top, offset) * alpha + read(bottom, offset) * (1 - alpha))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(0)}${channel(2)}${channel(4)}`;
}
