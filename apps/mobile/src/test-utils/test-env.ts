/**
 * Entorno determinista para la suite unitaria (`bun test`).
 *
 * POR QUÉ EXISTE: `src/core/config/env.ts` valida TODA la superficie
 * `EXPO_PUBLIC_*` con Zod al importar y lanza si falta
 * `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Varios
 * tests llegan a ese módulo de forma transitiva (el barrel de
 * `features/notifications`, el repositorio de auth), así que sin variables
 * el fichero entero moría AL IMPORTAR: el suite solo pasaba en la máquina
 * que tenía un `apps/mobile/.env` local (que está en `.gitignore`) y
 * fallaba en cualquier checkout limpio, con el error de Expo escondido
 * detrás de tres "ficheros que no llegan a ejecutar".
 *
 * Los valores son los mismos dummies que ya usa el e2e del móvil
 * (`playwright.config.ts`, `e2e-agent/serve.ts`) y que ya define
 * `.github/workflows/ci.yml` para `bun run test`: un proyecto falso y una
 * anon key falsa. Ningún test abre un socket contra ellos — las
 * repositorios van con el cliente de Supabase mockeado.
 *
 * POR QUÉ SE SOBRESCRIBEN Y NO SE RELLENAN: el suite no puede depender ni
 * del `.env` del desarrollador ni de las variables del shell (CI las
 * inyecta, un dev puede apuntar a producción). Fijar el valor exacto hace
 * que el resultado sea el mismo en todas partes.
 */
export function applyTestEnv(): void {
	// Requeridas por el validador: sin ellas `loadEnv()` lanza.
	process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
	process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

	// Opcionales: valores inocuos para que un `.env` local con credenciales
	// reales (Sentry, Maps, EAS, Firebase) no se cuele en el suite. Con el
	// DSN vacío la analítica queda apagada (ver `src/core/analytics`).
	process.env.EXPO_PUBLIC_SENTRY_DSN = "";
	process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "";
	process.env.EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL = "";
	process.env.EXPO_PUBLIC_ENVIRONMENT = "development";
	process.env.EXPO_PUBLIC_EAS_PROJECT_ID = "";
	process.env.EXPO_PUBLIC_FIREBASE_API_KEY = "";
	process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = "";
	process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "";
	process.env.EXPO_PUBLIC_FIREBASE_APP_ID = "";
	process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY = "";
	process.env.EXPO_PUBLIC_API_URL = "";
}
