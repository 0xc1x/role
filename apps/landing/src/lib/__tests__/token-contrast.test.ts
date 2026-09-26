/**
 * Contraste de los tokens de la landing, medido con la fórmula de WCAG 2.1.
 *
 * No es una prueba de "queda bien": es la razón por la que dos valores
 * concretos están prohibidos en dos superficies concretas. Si alguien devuelve
 * `text-role-primary` al hero o `border-transparent` a un campo, esta spec
 * falla con el número, no con la opinión del revisor.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compositeOver, contrast } from "@/test-utils/contrast";

// Tokens leídos de src/styles.css. Duplicados a propósito: si el token se
// cambia en el CSS y no acá, la spec sigue midiendo el valor viejo y deja de
// proteger nada. `tokenContrast.test.ts` falla si alguno de estos hex se mueve.
const TOKENS = {
	rolePrimary: "#371949",
	roleSecondary: "#DCCBF5",
	roleDarkBg: "#121212",
	roleBackground: "#FAF9F7",
	cream: "#fcfbf3",
	sage: "#7e7391",
} as const;

/** WCAG 1.4.3 / 1.4.11: 3:1 para texto grande y para fronteras de UI. */
const AA_LARGE_AND_UI = 3;
const AA_TEXT = 4.5;

/** `oklch(0.92 0.01 325)` — `--input` en `:root`, el relleno de los campos. */
const INPUT_FILL_LIGHT = "#EDEBF1";
const INPUT_FILL_ALPHA_50 = `${INPUT_FILL_LIGHT}80`;

/** Sufijo de clase de Tailwind (`text-role-secondary`) → hex del token. */
const TEXT_TOKENS: Record<string, string> = {
	"role-primary": TOKENS.rolePrimary,
	"role-secondary": TOKENS.roleSecondary,
	"role-dark-bg": TOKENS.roleDarkBg,
	white: "#ffffff",
};

const forBusiness = readFileSync(
	new URL("../../routes/for-business.tsx", import.meta.url),
	"utf8",
);
const input = readFileSync(
	new URL("../../components/ui/input.tsx", import.meta.url),
	"utf8",
);
const contact = readFileSync(
	new URL("../../components/contact.tsx", import.meta.url),
	"utf8",
);
/** Solo la clase compartida, no el archivo entero: los comentarios explican el
 *  valor viejo que se acaba de quitar y mentionarían su rgba. */
const inputCream =
	contact.match(/const inputCream =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
const styles = readFileSync(
	new URL("../../styles.css", import.meta.url),
	"utf8",
);

describe("hero de /for-business: los proof numbers sobre el fondo oscuro", () => {
	// El defecto que esto cubre: los tres números ("12%", "<24h", el conteo de
	// comercios) se pintaban con `text-role-primary` sobre `bg-role-dark-bg`,
	// 1.25:1. Inexistentes en la página que decide si un comercio se registra.
	test("el token anterior no servía y el actual sí", () => {
		const before = contrast(TOKENS.rolePrimary, TOKENS.roleDarkBg);
		const after = contrast(TOKENS.roleSecondary, TOKENS.roleDarkBg);

		expect(before).toBeLessThan(AA_LARGE_AND_UI);
		expect(after).toBeGreaterThanOrEqual(AA_TEXT);
		// 1.25:1 -> 12.40:1. Si el segundo número cambia, el arreglo se movió.
		expect(before).toBeCloseTo(1.25, 1);
		expect(after).toBeCloseTo(12.4, 1);
	});

	test("el proof number usa un token que pasa AA contra el hero", () => {
		// El `<dd>` del stats strip, no cualquier texto de la página.
		const proof = forBusiness.match(
			/<p className="font-heading text-3xl font-bold tabular-nums text-([\w-]+)/,
		);
		expect(proof).not.toBeNull();

		// Las clases de Tailwind van en kebab-case (`text-role-secondary`).
		const hex = TEXT_TOKENS[proof?.[1] ?? ""];
		expect(hex).toBeDefined();
		expect(contrast(hex as string, TOKENS.roleDarkBg)).toBeGreaterThanOrEqual(
			AA_TEXT,
		);
	});

	test("el hero sigue siendo el fondo oscuro que asume la medición", () => {
		expect(forBusiness).toContain("bg-role-dark-bg");
	});
});

describe("frontera de los campos de formulario (WCAG 1.4.11, 3:1)", () => {
	test("el Input del catálogo declara un borde, no transparente", () => {
		expect(input).not.toContain("border border-transparent");
		expect(input).toContain("border-sage");
	});

	test("`border-sage` pasa 3:1 en las dos superficies donde se usa el Input", () => {
		// 1) business-signup: el body pinta `role-background`.
		expect(contrast(TOKENS.sage, TOKENS.roleBackground)).toBeGreaterThanOrEqual(
			AA_LARGE_AND_UI,
		);
		// 2) contact: los campos se pintan `cream`.
		expect(contrast(TOKENS.sage, TOKENS.cream)).toBeGreaterThanOrEqual(
			AA_LARGE_AND_UI,
		);
	});

	test("el borde anterior no distinguía el campo del fondo", () => {
		// Lo que se veía era el relleno `bg-input/50` contra la página, porque
		// `border-transparent` no dibuja nada. Medido: 1.06:1.
		const fill = compositeOver(INPUT_FILL_ALPHA_50, TOKENS.roleBackground);
		expect(contrast(fill, TOKENS.roleBackground)).toBeLessThan(AA_LARGE_AND_UI);
	});

	test("los campos de contacto no dependen de una sombra tenue", () => {
		// `shadow-[0_0_0_1px_rgba(18,36,26,0.12)]` sobre cream daba 1.27:1.
		const ring = compositeOver("#12241A1F", TOKENS.cream);
		expect(contrast(ring, TOKENS.cream)).toBeLessThan(AA_LARGE_AND_UI);
		expect(inputCream).not.toContain("rgba(");
		expect(inputCream).not.toContain("border-0");
		expect(inputCream).toContain("border border-sage");
	});

	test("el foco no borra la frontera del campo", () => {
		// El select de ciudad traía `focus-visible:border-0`: al enfocar, el
		// campo perdía su único borde.
		expect(contact).not.toContain("focus-visible:border-0");
	});
});

describe("los hex que estas specs miden siguen siendo los del CSS", () => {
	// Si alguien retona el CSS sin tocar esta spec, la spec mediría el valor
	// viejo y pasaría mintiendo. Este test es el que cierra esa puerta.
	const cssTokens: Record<string, string> = {
		rolePrimary: "--color-role-primary",
		roleSecondary: "--color-role-secondary",
		roleDarkBg: "--color-role-dark-bg",
		roleBackground: "--color-role-background",
		cream: "--color-cream",
		sage: "--color-sage",
	};

	for (const [key, cssVar] of Object.entries(cssTokens)) {
		test(`--${cssVar} no cambió`, () => {
			const declared = styles.match(
				new RegExp(`${cssVar}:\\s*(#[0-9A-Fa-f]{6})`),
			)?.[1];
			expect(declared?.toLowerCase()).toBe(
				(TOKENS as Record<string, string>)[key]?.toLowerCase(),
			);
		});
	}
});
