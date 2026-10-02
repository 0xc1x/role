# e2e (tester.army) coexistente con Playwright — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una segunda suite e2e (`e2e` de tester.army) que convive con Playwright, empezando por web con tests deterministas y sin modelo.

**Architecture:** Un `e2e.config.ts` por app (el runner descubre config por directorio) + tests en `apps/<app>/e2e-agent/`, un directorio separado del `e2e/` de Playwright. Script y task de turbo nuevos (`test:e2e:agent`); `test:e2e` (Playwright) queda intacto y es el gate de no-regresión.

**Tech Stack:** `e2e@0.15.1`, `@e2e-dev/web@0.11.1`, `playwright@1.63.0` (ya instalado), Bun 1.4.2, Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-01-e2e-agent-web-design.md`

## Global Constraints

- **Nunca** tocar, mover ni borrar un archivo bajo `apps/*/e2e/` (suite Playwright) ni `apps/*/playwright.config.ts`.
- **`test:e2e` sigue siendo Playwright.** No le agregues `e2e` ni sus tests.
- **Ningún `agent.act` / `agent.assert` / `explore`** en este plan: no hay modelo configurado. Tests solo con `app`, `screen`, `browser`, `expect`.
- **Ningún secret ni `.env` nuevo.** Los valores viajan por `command.env` o `turbo.json`.
- **`E2E_TELEMETRY_DISABLED=1`** en cada script que invoque `e2e`.
- **`cache: 'off'`** en los tres configs (sin modelo no hay replay que valga).
- Puertos existentes, no los cambies: landing **3101** + stub **3999**, admin **3110** + stub **4110**, mobile-web **8085**.
- `output` es relativo al **project root**, que es el directorio del `e2e.config.ts` (el directorio del archivo). Debe ser interior a ese root y **no** puede contener el directorio del glob de tests.

## Review Focus

Cinco entradas/condiciones que el spec implica pero que ningún test de este plan ejercita de forma directa — la primera es la que más muerde:

1. **Un dev server preexistente de otra branch.** Fuera del estado "obsoleto" del código, el resultado es una suite que pasa contra código que no está bajo prueba. Comportamiento esperado: `reuseExisting` apagado, como en las tres configs de Playwright del repo.
2. **El `output` colisiona con el glob de tests.** Un `output` que contenga `e2e-agent/` hace fallar la carga del config con `INVALID_CONFIG`. Comportamiento esperado: rutas disjuntas, verificadas en Task 1.
3. **`.e2e/` de la raíz compartido por las tres apps.** Comportamiento esperado: cada app escribe en su propio directorio, nunca en la raíz del monorepo.
4. **El `.gitignore` de `.e2e/` no cubre el output por app.** El `.gitignore` raíz ya lista `.e2e/artifacts/` etc., pero no las rutas por app; si aparecen archivos sin ignorar, hay que añadir la entrada.
5. **Un path desconocido en el stub se reenvía a un backend real.** `apps/landing/.env` apunta a producción (ver el header de `apps/landing/e2e/business-signup.spec.ts`). Comportamiento esperado: el stub responde 404, nunca reenvía.

---

### Task 1: Andamiaje del runner en `apps/landing`

Primer contacto real con el runner. Deja `e2e` instalable y ejecutable desde el monorepo, y fija las dos invariantes que las otras apps copian.

**Files:**
- Modify: `package.json` (root) — devDependencies
- Create: `apps/landing/e2e.config.ts`
- Create: `apps/landing/e2e-agent/business-signup.e2e.ts`
- Modify: `apps/landing/package.json` — script `test:e2e:agent`
- Modify: `turbo.json` — task `test:e2e:agent`
- Modify: `.gitignore` — output por app

**Interfaces:**
- Consumes: `apps/landing/e2e/stub-api.ts` (Bun.serve en 3999, ruta `POST /api/v1/businesses/onboarding`, 404 para lo demás); los labels de `apps/landing/src/routes/business-signup.tsx` (`signup-name`, `signup-email`, `signup-password`, `signup-confirm`, `signup-business`, `signup-phone`).
- Produces: script `test:e2e:agent` en `apps/landing/package.json` y task homónima en `turbo.json`, ambos con la forma exacta que Tasks 2 y 3 copian para admin y mobile.

- [ ] **Step 1: Instalar el runner y confirmar que el peer de Playwright se satisface**

El worktree no tiene `e2e`: el `bun install` de esta rama no lo trae porque la instalación del checkout principal fue previa al worktree. Corré el `bun add` **desde la raíz** del worktree (`-w` no existe en Bun 1.4.2; las devDependencies van al `package.json` raíz, que es donde ya viven `e2e`, `@e2e-dev/web` y `playwright`).

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun add -d e2e@^0.15.1 @e2e-dev/web@^0.11.1
bunx e2e --version
```

Expected: imprime `0.15.1`. Si `@e2e-dev/web` protesta por el peer `playwright >=1.63.0 <2`, el `playwright@1.63.0` que ya está en el root lo cumple y no debe pedir nada.

- [ ] **Step 2: Escribir el test que falla**

`apps/landing/e2e-agent/business-signup.e2e.ts`:

```ts
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const VALID = {
	name: "Ada Lovelace",
	email: "ada@e2e.example",
	password: "sup3rsecreta",
	business: "Panadería La Espiga",
	phone: "+593 99 123 4567",
};

test("un negocio nuevo se registra desde el formulario público", async ({
	app,
	screen,
}) => {
	await app.open("/business-signup");

	await screen.getByLabel("Tu nombre *").fill(VALID.name);
	await screen.getByLabel("Email *").fill(VALID.email);
	await screen.getByLabel("Contraseña *").fill(VALID.password);
	await screen.getByLabel("Confirmar contraseña *").fill(VALID.password);
	await screen.getByLabel("Nombre del negocio *").fill(VALID.business);
	await screen.getByLabel("Teléfono").fill(VALID.phone);

	await screen.getByRole("button", { name: /crear cuenta/i }).click();

	await expect(screen.getByRole("alert")).toBeVisible();
});
```

Los valores salen de `VALID` en `apps/landing/e2e/business-signup.spec.ts` (`VALID` de Playwright) y de `apps/landing/src/routes/business-signup.tsx`; el alert de éxito/error es el `role="alert"` de esa misma ruta (línea 286).

- [ ] **Step 3: Correr el test para confirmar que falla**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/landing
bunx e2e run e2e-agent/business-signup.e2e.ts
```

Expected: FAIL. Sin `e2e.config.ts` el runner no encuentra target y el comando sale distinto de cero.

- [ ] **Step 4: Escribir `e2e.config.ts`**

`apps/landing/e2e.config.ts`:

```ts
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	// Sin modelo en esta fase, el replay cache no tiene nada que guardar.
	cache: "off",
	targets: [
		{
			name: "landing",
			engine: web(),
			app: {
				url: "http://127.0.0.1:3101",
				command: {
					executable: "bun",
					args: ["e2e/stub-api.ts"],
					env: { STUB_API_PORT: "3999" },
					log: ".e2e/logs/stub-api.log",
				},
			},
		},
		{
			name: "landing-ui",
			engine: web(),
			app: {
				url: "http://127.0.0.1:3101",
				command: {
					executable: "bunx",
					args: [
						"vite",
						"dev",
						"--port",
						"3101",
						"--host",
						"127.0.0.1",
					],
					env: { VITE_API_URL: "http://127.0.0.1:3999/api/v1" },
					startupTimeout: 180_000,
					// Un preview de otra branch, o uno arrancado con el
					// VITE_API_URL de producción del shell, no se puede reusar:
					// desde afuera son idénticos. Mismo argumento y mismo
					// `false` que en apps/landing/playwright.config.ts:56-62.
					reuseExisting: false,
					log: ".e2e/logs/vite.log",
				},
			},
		},
	],
} satisfies E2EConfig;
```

**Dos targets, no uno.** `app.command` es un solo proceso por target y el readiness se sondea en `app.url`: un único target no puede levantar a la vez el stub (3999) y el dev server (3101), porque solo hay un `command` y un `url`. Los dos targets comparten el mismo `url`, y el runner los treats como surfaces distintas.

Si Step 5 muestra que un test corre contra el target equivocado, el fix es un solo target con `app.url` en 3101 y el stub lanzado por el mismo `command` (un script que levante ambos). **Prueba los dos targets primero**; el objetivo es que `app.open()` resuelva en 3101.

- [ ] **Step 5: Correr el test para confirmar que pasa**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/landing
bunx e2e run e2e-agent/business-signup.e2e.ts
```

Expected: PASS, 1 test. Si falla con `APP_UNREACHABLE`, el `command` no levantó: mirá `.e2e/logs/vite.log` y `.e2e/logs/stub-api.log`.

- [ ] **Step 6: Verificar que el output NO se escribe en la raíz del monorepo**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
ls -d .e2e 2>/dev/null && echo "FAIL: output escribió en la raíz" || echo "OK: sin .e2e en la raíz"
ls -d apps/landing/.e2e && echo "OK: output en apps/landing/.e2e"
```

Expected: la primera línea imprime `OK: sin .e2e en la raíz` (el project root es `apps/landing`, no el monorepo). Esto fija Review Focus #2 y #3.

- [ ] **Step 7: Añadir los scripts y la task de turbo**

`apps/landing/package.json`, junto a los scripts existentes:

```json
"test:e2e:agent": "E2E_TELEMETRY_DISABLED=1 e2e run"
```

`turbo.json`, junto a la task `test:e2e`:

```json
"test:e2e:agent": {
  "dependsOn": ["^build"],
  "env": ["VITE_API_URL"]
}
```

- [ ] **Step 8: Añadir el output por app al `.gitignore`**

`.gitignore` ya lista `.e2e/artifacts/`, `.e2e/cache/`, `.e2e/report.json` y|display more` etc. (líneas 39-48, de `e2e init`), pero **no** las rutas por app. Añade:

```gitignore
apps/*/.e2e/
```

- [ ] **Step 9: Verificar que Playwright no se movió**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
ls apps/landing/e2e/ | head
grep -n '"test:e2e"' apps/landing/package.json
```

Expected: `apps/landing/e2e/` sigue con sus specs, y `"test:e2e"` sigue siendo `playwright test --config playwright.config.ts`.

- [ ] **Step 10: Correr el gate de no-regresión**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
VITE_API_URL=https://test.invalid/api/v1 bun run test --filter=role-landing
```

Expected: PASS. `VITE_API_URL` es obligatorio: `apiUrl()` (`apps/landing/src/lib/api.ts:13`) devuelve `""` sin ella y `api-post.test.ts` falla. Es env, no código roto.

- [ ] **Step 11: Commit**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git add package.json bun.lock turbo.json .gitignore apps/landing/e2e.config.ts apps/landing/e2e-agent/ apps/landing/package.json
git commit -m "test(landing): suite e2e de tester.army coexistente con Playwright"
```

---

### Task 2: `apps/admin` — el gate de auth

Admin es la app con más superficie que landing y con el stub más elaborado. El valor de esta task es probar que un `e2e.config.ts` con `credentials` declaradas convive con el gate de auth existente.

**Files:**
- Create: `apps/admin/e2e.config.ts`
- Create: `apps/admin/e2e-agent/auth-gate.e2e.ts`
- Modify: `apps/admin/package.json` — script

**Interfaces:**
- Consumes: `ADMIN_EMAIL` (`admin@role.test`), `ADMIN_PASSWORD` (`correct-horse-battery`), `ADMIN_USER`, `failureSentinelFor`, `respondTo` de `apps/admin/e2e/fixtures/api-fixtures.ts`; `stubApi`, `waitForGuardDecision`, `waitForLoginForm` de `apps/admin/e2e/support/admin.ts`; `PAYOUTS_FAILURE_FILTER` / `CATEGORIES_FAILURE_FILTER`.
- Produces: el patrón de `credentials` declaradas en config + resueltas en el test, que es la forma en que Phase 2 (provider) Izzyoltageá los secrets.

- [ ] **Step 1: Escribir el test que falla**

`apps/admin/e2e-agent/auth-gate.e2e.ts`:

```ts
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ADMIN_EMAIL = "admin@role.test";
const ADMIN_PASSWORD = "correct-horse-battery";

test("un anónimo que pide una sección aterriza en el login", async ({
	app,
	browser,
}) => {
	await app.open("/negocios");
	await expect(browser).toHaveURL(/\/login/);
	await expect(
		browser.getByRole("textbox", { name: /correo|email/i }),
	).toBeVisible();
});
```

El patrón `/negocios` y el rebote a `/login` son los que ya fija `apps/admin/e2e/auth.gate.spec.ts`. `ADMIN_EMAIL`/`ADMIN_PASSWORD` son los mismos valores de `api-fixtures.ts:121-122` — **declarados como constantes del test en esta fase**, no como `credentials` de config, porque no hay nada que proteger todavía y `credentials` sin un secret manager detrás solo mueve el problema.

- [ ] **Step 2: Correr el test para confirmar que falla**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/admin
bunx e2e run e2e-agent/auth-gate.e2e.ts
```

Expected: FAIL — sin `e2e.config.ts` no hay target.

- [ ] **Step 3: Escribir `e2e.config.ts`**

`apps/admin/e2e.config.ts`:

```ts
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	cache: "off",
	targets: [
		{
			name: "admin-stub",
			engine: web(),
			app: {
				url: "http://127.0.0.1:4110",
				command: {
					executable: "bun",
					args: ["e2e/stub-api.ts"],
					env: { ADMIN_E2E_STUB_PORT: "4110" },
					log: ".e2e/logs/stub-api.log",
				},
			},
		},
		{
			name: "admin-ui",
			engine: web(),
			app: {
				url: "http://127.0.0.1:3110",
				command: {
					executable: "bunx",
					args: [
						"vite",
						"dev",
						"--port",
						"3110",
						"--host",
						"127.0.0.1",
					],
					env: { VITE_API_URL: "http://127.0.0.1:4110/api/v1" },
					startupTimeout: 180_000,
					reuseExisting: false,
					log: ".e2e/logs/vite.log",
				},
			},
		},
	],
} satisfies E2EConfig;
```

Si `apps/admin/e2e/stub-api.ts` lee otro nombre de env que `ADMIN_E2E_STUB_PORT`, usá el que el archivo lee (es el que `apps/admin/playwright.config.ts:14` ya define).

- [ ] **Step 4: Correr el test para confirmar que pasa**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/admin
bunx e2e run e2e-agent/auth-gate.e2e.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Añadir el script**

`apps/admin/package.json`:

```json
"test:e2e:agent": "E2E_TELEMETRY_DISABLED=1 e2e run"
```

- [ ] **Step 6: Verificar que Playwright no se movió y commitear**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
ls apps/admin/e2e/ | head
git add apps/admin/e2e.config.ts apps/admin/e2e-agent/ apps/admin/package.json
git commit -m "test(admin): suite e2e de tester.army para el gate de auth"
```

---

### Task 3: `apps/mobile` — el artefacto PWA

Cierra el alcance web. Reusa el `export:web` + `static-server.mjs` que Playwright ya ejercita: es el mismo artefacto, otro runner. **No se toca `apps/mobile/src` ni se agregan `testID`.**

**Files:**
- Create: `apps/mobile/e2e.config.ts`
- Create: `apps/mobile/e2e-agent/boot.e2e.ts`
- Modify: `apps/mobile/package.json` — script

**Interfaces:**
- Consumes: `apps/mobile/e2e/static-server.mjs`; `strings` de `apps/mobile/src/core/i18n/strings`; las dummies `EXPO_PUBLIC_*` que `apps/mobile/playwright.config.ts` ya define.
- Produces: nada más allá de la suite; es la última app del alcance web.

- [ ] **Step 1: Escribir el test que falla**

`apps/mobile/e2e-agent/boot.e2e.ts`:

```ts
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("la app monta y muestra el feed de ofertas", async ({ app, screen }) => {
	await app.open("/");
	await expect(
		screen.getByRole("heading", { name: /ofertas|rescata/i }),
	).toBeVisible();
});
```

Si el heading accesible del home no matchea esa regex en el primer run, cambiala por el rol+nombre real que el reporte muestre — no inventes un locator que el producto no renderiza.

- [ ] **Step 2: Correr el test para confirmar que falla**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/mobile
bunx e2e run e2e-agent/boot.e2e.ts
```

Expected: FAIL — sin config no hay target.

- [ ] **Step 3: Escribir `e2e.config.ts`**

`apps/mobile/e2e.config.ts`:

```ts
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

const EXPO_DUMMIES = {
	EXPO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
	EXPO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
	EXPO_NO_TELEMETRY: "1",
};

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	cache: "off",
	targets: [
		{
			name: "mobile-pwa",
			engine: web(),
			app: {
				url: "http://127.0.0.1:8085",
				command: {
					executable: "bun",
					args: ["run", "export:web"],
					env: EXPO_DUMMIES,
					startupTimeout: 300_000,
				},
			},
		},
		{
			name: "mobile-pwa-server",
			engine: web(),
			app: {
				url: "http://127.0.0.1:8085",
				command: {
					executable: "bun",
					args: ["e2e/static-server.mjs", "8085", "dist"],
					startupTimeout: 60_000,
					log: ".e2e/logs/static-server.log",
				},
			},
		},
	],
} satisfies E2EConfig;
```

Las dummies son obligatorias: `apps/mobile/src/core/config/env.ts` valida toda la superficie `EXPO_PUBLIC_*` con Zod al arrancar y tira en la primera clave faltante, así que sin ellas la app no monta y todo locator expira. Mismo argumento que el de `apps/mobile/playwright.config.ts:66-78`.

Si `export:web` necesita las cuatro dummies de Firebase (`EXPO_PUBLIC_FIREBASE_*`, ver `.github/workflows/ci.yml:120-123`), agregalas a `EXPO_DUMMIES`: el paso de pre-export de mobile aborta si falta alguna.

- [ ] **Step 4: Correr el test para confirmar que pasa**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/mobile
bunx e2e run e2e-agent/boot.e2e.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Añadir el script y commitear**

```json
"test:e2e:agent": "E2E_TELEMETRY_DISABLED=1 e2e run"
```

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git add apps/mobile/e2e.config.ts apps/mobile/e2e-agent/ apps/mobile/package.json
git commit -m "test(mobile): suite e2e de tester.army sobre el PWA exportado"
```

---

### Task 4: Verificación de no-regresión del monorepo

Cierra el alcance web. Ningún cambio de código: esta task es la prueba de que nada se rompió.

**Files:** ninguno. Solo verificación.

**Interfaces:**
- Consumes: los tres scripts `test:e2e:agent` de Tasks 1-3.
- Produces: la evidencia de que Playwright sigue verde y que la suite nueva corre en los tres apps.

- [ ] **Step 1: Correr `test:e2e:agent` en las tres apps**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun run test:e2e:agent
```

Expected: los tres workspaces con `test:e2e:agent` reportan PASS.

- [ ] **Step 2: Correr la suite Playwright completa (el gate real)**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun run test:e2e
```

Expected: PASS en `role-api`, `role-front-admin`, `role-landing`, `role-mobile`. **Cualquier fallo acá es una regresión de este plan.** Requiere el Postgres de test: `docker compose up -d` (o el servicio de `ci.yml`).

- [ ] **Step 3: Typecheck y suite unitaria del monorepo**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun run typecheck
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:6432/role_test \
EXPO_PUBLIC_SUPABASE_URL=https://test.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
VITE_API_URL=https://test.invalid/api/v1 \
bun run test
```

Expected: typecheck 6/6, tests verdes. Las env son las de `ci.yml:107-123`.

- [ ] **Step 4: Confirmar que el `.gitignore` cubre todo el output**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git status --short
git check-ignore -q apps/landing/.e2e && echo "OK: ignorado"
```

Expected: `git status --short` no lista ningún `.e2e`; el segundo comando imprime `OK: ignorado`.

- [ ] **Step 5: Confirmar que no hay archivos de Playwright modificados**

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git diff HEAD~3 --stat -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts' 'playwright.config.ts'
```

Expected: salida vacía. Si no lo está, este plan tocó algo que no debía.

---

## Fuera de alcance (Phase 2, spec propio)

`agent.act`/`assert`/`explore` y el provider de modelo (decidido: OpenCode, por definir cómo); `@e2e-dev/mobile` con iOS/Android; testIDs en `apps/mobile`; cualquier cambio en `.github/workflows/ci.yml` o en el job `quality`; telemetría activada; replay cache.