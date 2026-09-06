/**
 * Empaqueta `dist/` (export web de Expo, ya post-procesado) al formato
 * Build Output API que espera `vercel deploy --prebuilt`:
 *
 *   .vercel/output/static/*  ← copia de dist/
 *   .vercel/output/config.json (version 3)
 *
 * Las rutas se derivan de `vercel.json` (headers + rewrites) para no
 * duplicarlas: `{"handle":"filesystem"}` va antes del fallback SPA.
 */
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const OUTPUT = join('.vercel', 'output');
const STATIC = join(OUTPUT, 'static');

// 1) Limpiar solo el output (nunca .vercel/project.json) y copiar dist/
rmSync(STATIC, { recursive: true, force: true });
mkdirSync(STATIC, { recursive: true });
cpSync(DIST, STATIC, { recursive: true });

// 2) Derivar rutas desde vercel.json
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const routes = [
	...(vercel.headers ?? []).map(({ source, headers }) => ({
		src: source,
		headers: Object.fromEntries(headers.map((h) => [h.key, h.value])),
	})),
	{ handle: 'filesystem' },
	...(vercel.rewrites ?? []).map(({ source, destination }) => ({
		src: source,
		dest: destination,
	})),
];

writeFileSync(join(OUTPUT, 'config.json'), JSON.stringify({ version: 3, routes }, null, '\t') + '\n');
console.log(`✓ .vercel/output regenerado desde ${DIST}/ (${routes.length} rutas)`);
