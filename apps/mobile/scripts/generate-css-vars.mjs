/**
 * Genera las CSS variables de `global.css` desde los tokens de
 * `src/core/theme/colors.ts` (única fuente de verdad de color).
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
		return `    ${cssVar}: ${value.toLowerCase()};`;
	});
	return lines.join("\n");
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