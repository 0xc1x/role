import { defineConfig, devices } from "@playwright/test";

import base from "../../playwright.config";

/**
 * E2E for the consumer PWA.
 *
 * ─── What this suite covers, and what it structurally cannot ────────────────
 *
 * `apps/mobile` ships two artifacts from one codebase: the native iOS/Android
 * binary, and the web PWA that `expo export` produces for Vercel. This suite
 * drives the SECOND one. An e2e over the exported bundle does not exercise the
 * native binary: not the Metro production build, not the native modules
 * (`react-native-maps`, `expo-camera`, `expo-notifications`, `expo-secure-store`
 * keychain storage), not the platform tab/gesture behaviour, and not the app
 * store artifact. That is Maestro or Detox, a separate toolchain, a separate
 * CI image and a separate budget. This file is not that.
 *
 * ─── Why the static export instead of `expo start --web` ────────────────────
 *
 * Measured on this machine, cold caches (`node_modules/.cache` and `dist/`
 * removed), Chromium 153, 390x844 — see `e2e/bench-boot.mjs`:
 *
 *   | step                          | export + static server | expo start --web |
 *   |-------------------------------|------------------------|------------------|
 *   | server answering HTTP          | ~0.1 s                 | 2.8 s            |
 *   | first meaningful paint         | 523 ms                 | 2 944 ms         |
 *   | consumer tabs after skipping   | 486 ms                 | 497 ms           |
 *   |                             total cold to interactive | ~4.3 s           | ~6.6 s           |
 *
 * The static build is ~5.6x faster to first paint and, more importantly,
 * DETERMINISTIC: 523 ms on every run, because the bundle is already
 * minified, hashed and on disk. The dev server's number is a function of
 * Metro's transform cache, so it swings between 1.1 s and 19.6 s depending
 * on whether the cache survived — and CI does not cache `node_modules/.cache`
 * or `.expo`, so CI pays the cold number on every run.
 *
 * The decisive argument is not the clock. `expo start` serves a DEV bundle:
 * unminified, with the HMR client and dev-only branches in it. The PWA users
 * get is the production export. Testing the dev bundle means testing a
 * different program from the one that ships. `expo export` produces the
 * exact bytes Vercel serves, and the static server reproduces the SPA
 * fallback that `vercel.json` declares — so a deep link that only works in
 * dev is a bug this suite can actually see.
 */
const PORT = Number(process.env.MOBILE_E2E_PORT ?? 8085);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	...base,
	testDir: "./e2e",
	// Ship-level UI: the PWA is a phone-first app, and the consumer tab bar
	// is a bottom bar. Testing it at desktop width proves nothing about the
	// layout users actually get.
	use: {
		...base.use,
		...devices["Pixel 7"],
		baseURL: BASE_URL,
	},
	webServer: {
		// `expo export` is the artifact; the static server is how Vercel
		// serves it. Chained so Playwright's readiness probe owns both.
		command: `bun run export:web:e2e && node e2e/static-server.mjs ${PORT} dist`,
		url: BASE_URL,
		// `export:web:e2e` NO lleva `--clear`, a diferencia de `export:web` y de
		// `build:vercel`. Medido acá: el export frío tarda 190 s y el caliente 125 s,
		// con el bundling solo pasando de 118 s a 48 s.
		//
		// POR QUÉ ES SEGURO SEPARADO DEL DEPLOY, y por qué no es "lo mismo con otro
		// nombre": Metro inlinea los valores `EXPO_PUBLIC_*` al transformar pero NO
		// los mete en el hash del módulo — verificado en
		// `@expo/metro-config/build/babel-transformer.js`, cuyo `getCacheKey` hashea
		// solo los archivos de config de Babel. O sea que un bundle cacheado puede
		// volver a salir con el env de otro lado: el envenenamiento que `--clear`
		// previene, y es real — el valor queda dentro del JS servido.
		//
		// El deploy (`build:vercel`) conserva `--clear` por eso: ahí el bundle es el
		// que se publica y no compensa arriesgarlo. El e2e corre con el env fijo del
		// workflow, y su caché se invalida cuando ese env cambia porque la key de CI
		// hashea el propio `.github/workflows/ci.yml`.
		timeout: 300_000,
		stdout: "pipe",
		stderr: "pipe",
		// Never reuse a developer's dev server: a stale `dist/` from another
		// branch would make the suite pass against code that is not under test.
		reuseExistingServer: !process.env.CI,
		env: {
			// WHY THESE EXACT DUMMIES: `src/core/config/env.ts` validates the
			// whole EXPO_PUBLIC_* surface with Zod AT STARTUP and throws on the
			// first missing key. Without them the app never mounts, every
			// locator times out, and the failure looks like a broken test
			// instead of a missing env var. These are the same dummies
			// `.github/workflows/ci.yml` already defines for `bun run test`.
			// They must stay unreachable: every spec stubs this origin at the
			// browser edge, so a request that escapes the stub is a bug, not a
			// network call.
			EXPO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
			EXPO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
			// The bundle is rebuilt on every run; a browser cache from the
			// previous one would test the previous one.
			EXPO_NO_TELEMETRY: "1",
		},
	},
});
