/**
 * Aplica alpha (0-1) a un color hex.
 *
 * Los tokens de `colors.ts` son opacos; RN no compone alpha por separado,
 * así que los tintes translúcidos se construyen aquí en lugar de
 * concatenar sufijos hex a mano (`colors.x + "4D"`), que no valida ni
 * documenta la opacidad.
 */
export function withAlpha(hex: string, alpha: number): string {
	const value = hex.replace("#", "");
	let r: string;
	let g: string;
	let b: string;
	if (value.length === 3) {
		r = value[0]! + value[0]!;
		g = value[1]! + value[1]!;
		b = value[2]! + value[2]!;
	} else if (value.length >= 6) {
		r = value.slice(0, 2);
		g = value.slice(2, 4);
		b = value.slice(4, 6);
	} else {
		// Formato no reconocido: devolver el input intacto (fallback visible
		// mejor que crash en render).
		return hex;
	}
	const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, "0")
		.toUpperCase();
	return `#${r}${g}${b}${a}`;
}
