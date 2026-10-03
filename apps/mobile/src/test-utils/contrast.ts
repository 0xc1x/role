/**
 * WCAG 2.1 contrast helpers for the token contrast specs.
 *
 * Hoisted out of `PriceBreakdownCard.contrast.test.tsx` so every palette
 * assertion in the app measures the same way: relative luminance from the
 * WCAG formula, ratio as (L_lighter + 0.05) / (L_darker + 0.05), and alpha
 * channels composited over the opaque backdrop the device would show.
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

/** Flattens `#RRGGBBAA` over an opaque backdrop the way the device does. */
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

/** sRGB hex -> CIELAB (D65), the space `deltaE` measures in. */
export function toLab(hex: string): [number, number, number] {
	const value = hex.replace("#", "").slice(0, 6);
	const channel = (offset: number) => {
		const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const [r, g, b] = [channel(0), channel(2), channel(4)];
	const scaled = [
		(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
		0.2126 * r + 0.7152 * g + 0.0722 * b,
		(0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
	] as const;
	const f = (t: number) =>
		t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16) / 116;
	const [x, y, z] = [f(scaled[0]), f(scaled[1]), f(scaled[2])];
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * CIELAB hue angle in degrees, 0-360.
 *
 * The a/b plane is a circle around neutral grey, so this is "which way is this
 * colour from grey" — the one component that has to survive a change of
 * lightness. It is meaningless for a near-neutral colour (chroma ~0), where the
 * angle is numerical noise from rounding, so pair it with `chroma` rather than
 * reading it alone.
 */
export function hueAngle(hex: string): number {
	const [, a, b] = toLab(hex);
	const degrees = (Math.atan2(b, a) * 180) / Math.PI;
	return degrees < 0 ? degrees + 360 : degrees;
}

/** CIELAB chroma: distance from neutral grey. 0 is grey, ~60+ is vivid. */
export function chroma(hex: string): number {
	const [, a, b] = toLab(hex);
	return Math.hypot(a, b);
}

/** Smallest angle between two hue angles, in degrees (0-180). */
export function hueDistance(a: string, b: string): number {
	const raw = Math.abs(hueAngle(a) - hueAngle(b));
	return raw > 180 ? 360 - raw : raw;
}

/**
 * CIELAB ΔE between two opaque colours — how different they look, rather than
 * how far apart their bytes are.
 *
 * Needed because RGB distance lies about perceptual difference: two colours 200
 * apart in RGB can look identical (a saturated hue versus its own darker twin),
 * while two 20 apart can be plainly different. Roughly, ΔE below 10 is
 * invisible side by side and 25+ is an obvious difference at a glance.
 */
export function deltaE(a: string, b: string): number {
	const [l1, a1, b1] = toLab(a);
	const [l2, a2, b2] = toLab(b);
	return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
