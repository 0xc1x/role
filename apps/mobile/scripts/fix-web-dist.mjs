/**
 * Post-proceso del export web de Expo para Vercel.
 *
 * El CLI de Vercel excluye por defecto CUALQUIER directorio llamado
 * `node_modules`, y Metro genera rutas de assets tipo
 * `assets/__node_modules/.bun/<pkg>/node_modules/<pkg>/<font>.ttf`.
 * Sin este fix esas rutas no se suben y la app queda en blanco.
 *
 * Fix: aplana todos los assets a `assets/__nm/<nombre-con-hash>` (los hashes
 * de contenido garantizan unicidad) y reescribe las referencias en los
 * bundles servidos (js/html/css/json/map).
 *
 * Flujo seguro con staging: árbol fuente → tmp fuera de __nm → aplanar.
 */
import {
	readdirSync,
	renameSync,
	mkdirSync,
	rmSync,
	readFileSync,
	writeFileSync,
	existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';

const DIST = 'dist';
const NM_DIR = join(DIST, 'assets', '__nm');
const TMP_DIR = join(DIST, 'assets', '__nm_src_tmp');

// 1) Ubicar el árbol exportado (fresco: __node_modules | ya procesado: __nm)
let src = existsSync(OLD_DIR()) ? OLD_DIR() : existsSync(NM_DIR) ? NM_DIR : null;
if (!src) {
	console.log('✓ No hay assets __node_modules/__nm (nada que arreglar)');
	process.exit(0);
}

function OLD_DIR() {
	return join(DIST, 'assets', '__node_modules');
}

// 2) Mover el árbol a staging (fuera de __nm para poder limpiar sin miedo)
if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
renameSync(src, TMP_DIR);
mkdirSync(NM_DIR, { recursive: true });

// 3) Aplanar a assets/__nm/<basename>
function collectFiles(dir, acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) collectFiles(full, acc);
		else acc.push(full);
	}
	return acc;
}

const files = collectFiles(TMP_DIR);
for (const file of files) {
	const dest = join(NM_DIR, basename(file));
	if (existsSync(dest)) {
		if (readFileSync(dest).equals(readFileSync(file))) continue;
		throw new Error(`Colisión de nombre en asset: ${dest}`);
	}
	renameSync(file, dest);
}
rmSync(TMP_DIR, { recursive: true, force: true });

// 4) Reescribir referencias en los bundles servidos
const REWRITE_RE =
	/\/assets\/__(?:node_modules|nm)\/[^"'`\s)>]*\/([^/"'`\s)>]+)/g;
const TEXT_EXT = new Set(['.js', '.html', '.css', '.json', '.map']);
let rewrittenFiles = 0;
let rewrittenRefs = 0;

function walkRewrite(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walkRewrite(full);
		} else if (
			TEXT_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))
		) {
			const content = readFileSync(full, 'utf8');
			let count = 0;
			const next = content.replace(REWRITE_RE, (_m, filename) => {
				count++;
				return `/assets/__nm/${filename}`;
			});
			if (count > 0) {
				writeFileSync(full, next);
				rewrittenFiles++;
				rewrittenRefs += count;
			}
		}
	}
}

walkRewrite(DIST);
console.log(
	`✓ ${files.length} assets aplanados a assets/__nm · ${rewrittenRefs} referencias reescritas en ${rewrittenFiles} archivo(s)`,
);
