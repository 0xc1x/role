/**
 * Genera las CSS variables de `global.css` desde los tokens de
 * `src/core/theme/colors.ts` (única fuente de verdad de color).
 *
 * Los valores se emiten como TRIPLES HSL (`h s% l%`, con `/ a` si el hex
 * trae alfa), porque `tailwind.config.js` los consume como `hsl(var(--x))`
 * y los modificadores de opacidad como `hsl(var(--x) / 0.5)`. Un hex en la
 * variable produce `hsl(#ffffff)`, valor inválido que el navegador descarta
 * (background transparente). colors.ts conserva hex: los estilos inline de
 * React Native lo leen directo.
 *
 * Solo reescribe lo que está entre los marcadores `css-vars:generated`;
 * el resto del archivo se conserva. Corre con bun (transpila el import TS).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { colorTokens } from "../src/core/theme/colors";

// Token → variable CSS, en el orden estable del bloque generado.
const MAPPING = [
	["background", "--background"],
	["foreground", "--foreground"],
	["card", "--card"],
	["cardForeground", "--card-foreground"],
	["popover", "--popover"],
	["popoverForeground", "--popover-foreground"],
	["primary", "--primary"],
	["primaryForeground", "--primary-foreground"],
	["secondary", "--secondary"],
	["secondaryForeground", "--secondary-foreground"],
	["muted", "--muted"],
	["mutedForeground", "--muted-foreground"],
	["accent", "--accent"],
	["accentForeground", "--accent-foreground"],
	["destructive", "--destructive"],
	["destructiveForeground", "--destructive-foreground"],
	["border", "--border"],
	["borderSolid", "--border-solid"],
	["inputBackground", "--input"],
	["ring", "--ring"],
];

function block(scheme) {
	const tokens = colorTokens[scheme];
	const lines = MAPPING.map(([token, cssVar]) => {
		const value = tokens[token];
		if (!value) throw new Error(`Token faltante en ${scheme}: ${token}`);
		return `    ${cssVar}: ${toHslTriple(value)};`;
	});
	return lines.join("\n");
}

/**
 * `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` → triple HSL de CSS:
 * `h s% l%` (o `h s% l% / a` cuando el hex lleva alfa).
 * Dos decimales bastan para round-trip exacto a 8 bits (< 0.5/255).
 */
function toHslTriple(value) {
	const hex = String(value).trim();
	const m = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
	if (!m) {
		throw new Error(
			`Token no hex: "${value}". El generador solo emite triples HSL desde hex.`,
		);
	}
	let h = m[1];
	if (h.length <= 4) h = [...h].map((c) => c + c).join("");
	const to255 = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
	const r = to255(0);
	const g = to255(2);
	const b = to255(4);
	const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let hue = 0;
	if (d !== 0) {
		if (max === r) hue = 60 * (((g - b) / d) % 6);
		else if (max === g) hue = 60 * ((b - r) / d + 2);
		else hue = 60 * ((r - g) / d + 4);
		if (hue < 0) hue += 360;
	}
	const light = (max + min) / 2;
	// d === 0 implica light 0 o 1 → denominador 0 solo ahí, ya cubierto.
	const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1));

	const num = (n) => String(Math.round(n * 100) / 100);
	const triple = `${num(hue)} ${num(sat * 100)}% ${num(light * 100)}%`;
	return alpha < 1 ? `${triple} / ${num(alpha)}` : triple;
}

const START = "/* css-vars:generated:start (fuente: src/core/theme/colors.ts — regenerar con: bun scripts/generate-css-vars.mjs) */";
const END = "/* css-vars:generated:end */";

const path = new URL("../global.css", import.meta.url).pathname;
let css = readFileSync(path, "utf8");

const rootBlock = `  :root {\n    /* Modo de dark mode de css-interop: 'class' evita el error\n       "Cannot manually set color scheme" en web. */\n    --css-interop-darkMode: class;\n${START}\n${block("light")}\n${END}\n  }`;
const darkBlock = `  .dark {\n${START}\n${block("dark")}\n${END}\n  }`;

function replaceSection(css, opening, next) {
	const start = css.indexOf(opening);
	if (start === -1) throw new Error(`No se encontró ${opening}`);
	const markerStart = css.indexOf(START, start);
	const markerEnd = css.indexOf(END, markerStart);
	if (markerStart === -1 || markerEnd === -1) {
		throw new Error(`Faltan marcadores ${START.slice(0, 30)}… tras ${opening}`);
	}
	// Corta DESPUÉS del END para no duplicarlo en cada corrida.
	return css.slice(0, markerStart) + next + css.slice(markerEnd + END.length);
}

// :root termina donde empieza .dark; .dark termina donde empieza el bloque input.
css = replaceSection(css, ":root {", `${START}\n${block("light")}\n${END}`);
css = replaceSection(css, ".dark {", `${START}\n${block("dark")}\n${END}`);

writeFileSync(path, css);
console.log("global.css: variables regeneradas desde colors.ts");