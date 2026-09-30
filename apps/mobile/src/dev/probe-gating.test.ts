import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Puertas de empaquetado: lo que no puede llegar a un build de producción.
 *
 * Estas aserciones son sobre el sistema de archivos a propósito. Un import de
 * `bun` o una ruta de debug sólo se ven leyendo el fichero, no renderizando:
 * el bundle los aceptaría igual.
 */

const ROOT = join(import.meta.dir, "..", "..");

interface SourceFile {
	/** Ruta relativa al package, con separadores `/`. */
	path: string;
	source: string;
}

function walk(dir: string, out: SourceFile[] = []): SourceFile[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
			continue;
		}
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, out);
			continue;
		}
		if (!/\.(ts|tsx)$/.test(entry)) continue;
		out.push({
			path: relative(ROOT, full).split("\\").join("/"),
			source: readFileSync(full, "utf8"),
		});
	}
	return out;
}

const ALL_SOURCES = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src"))];

/** Un spec importa `bun`/`node:*` legítimamente; el runtime de la app no. */
const isSpec = (file: SourceFile) => /\.(test|spec)\.[tj]sx?$/.test(file.path);

test("the map diagnostic probe is not a route in the shipped router", () => {
	expect(existsSync(join(ROOT, "app", "map-diagnostic.tsx"))).toBe(false);

	// Nothing under `app/` may reference the probe: expo-router turns any
	// `app/**` file into a reachable route, including a re-export.
	const routeReferences = ALL_SOURCES.filter(
		(file) =>
			file.path.startsWith("app/") &&
			/map-diagnostic|MapDiagnosticScreen/.test(file.source),
	);
	expect(routeReferences).toEqual([]);

	// The probe is kept, but outside `app/` so it cannot ship.
	expect(
		existsSync(join(ROOT, "src/dev/map-diagnostic/MapDiagnosticScreen.tsx")),
	).toBe(true);
});

test("no shipped component imports a Node or Bun runtime module", () => {
	const runtimeImports = ALL_SOURCES.filter(
		(file) =>
			!isSpec(file) &&
			/(from\s+["'](bun|node:[^"']+)["']|require\(["'](bun|node:[^"']+)["']\))/.test(
				file.source,
			),
	);
	expect(runtimeImports.map((file) => file.path)).toEqual([]);
});

test("the diagnostic probe uses theme tokens instead of inline hex", () => {
	const probe = readFileSync(
		join(ROOT, "src/dev/map-diagnostic/MapDiagnosticScreen.tsx"),
		"utf8",
	);
	const inlineHex = probe.match(/color:\s*"#[0-9a-fA-F]{3,8}"/g) ?? [];
	expect(inlineHex).toEqual([]);
	expect(probe).not.toContain('"black"');
	expect(probe).not.toContain('"white"');
});

test("the generated router types no longer advertise the probe route", () => {
	// `.expo/types/router.d.ts` is a gitignored artifact the Expo CLI
	// regenerates from `app/`. When it is stale the test fails loudly instead
	// of pretending the gate is enforced.
	const generated = join(ROOT, ".expo/types/router.d.ts");
	if (!existsSync(generated)) return;
	expect(readFileSync(generated, "utf8")).not.toContain("map-diagnostic");
});
