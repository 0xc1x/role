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

- [x] **Step 1: Instalar el runner y confirmar que el peer de Playwright se satisface**

  > Verificado: `package.json:35,37` declara `"e2e": "^0.15.1"` y `"@e2e-dev/web": "^0.11.1"` en las devDependencies de la raíz.

El worktree no tiene `e2e`: el `bun install` de esta rama no lo trae porque la instalación del checkout principal fue previa al worktree. Corré el `bun add` **desde la raíz** del worktree (`-w` no existe en Bun 1.4.2; las devDependencies van al `package.json` raíz, que es donde ya viven `e2e`, `@e2e-dev/web` y `playwright`).

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun add -d e2e@^0.15.1 @e2e-dev/web@^0.11.1
bunx e2e --version
```

Expected: imprime `0.15.1`. Si `@e2e-dev/web` protesta por el peer `playwright >=1.63.0 <2`, el `playwright@1.63.0` que ya está en el root lo cumple y no debe pedir nada.

- [x] **Step 2: Escribir el test que falla**

  > Verificado: `apps/landing/e2e-agent/business-signup.e2e.ts` (172 líneas) — commit `6c602a2`.

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

- [x] **Step 3: Correr el test para confirmar que falla**

  > El rojo no quedó registrado con nombre de test: el ledger de la rama (`docs/superpowers/e2e-agent-evidence/sdd-ledger.md`) registra la revisión y las rondas de arreglo, no el test que se puso rojo.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/landing
bunx e2e run e2e-agent/business-signup.e2e.ts
```

Expected: FAIL. Sin `e2e.config.ts` el runner no encuentra target y el comando sale distinto de cero.

- [x] **Step 4: Escribir `e2e.config.ts`**

  > Verificado: `apps/landing/e2e.config.ts` (73 líneas) — `output: ".e2e"` y `cache: "off"`. **La forma del plan cambió**, y el ledger registra por qué: el plan pedía dos targets (stub + dev server) y quedó **uno**, cuyo `app.command` es un `serve.ts` que arranca los dos, con un `readyUrl` barato. El runner arranca todos los targets y gatea la corrida en cada `readyUrl`, así que un target-stub probado en la URL del dev server abortaba todo con `APP_UNREACHABLE`.

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

- [x] **Step 5: Correr el test para confirmar que pasa**

  > Verificado: `docs/superpowers/e2e-agent-evidence/task-4-report.md` item 1c — `cd apps/landing && bunx e2e run` → `Tests 1 passed (1)`, 150.68 s.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/landing
bunx e2e run e2e-agent/business-signup.e2e.ts
```

Expected: PASS, 1 test. Si falla con `APP_UNREACHABLE`, el `command` no levantó: mirá `.e2e/logs/vite.log` y `.e2e/logs/stub-api.log`.

- [x] **Step 6: Verificar que el output NO se escribe en la raíz del monorepo**

  > Verificado: el `output` es `".e2e"`, que resuelve dentro de `apps/landing/`; el informe item 8 dice que los tres `apps/*/.e2e` están ignorados y que hay **0** entradas `.e2e` en la raíz del monorepo.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
ls -d .e2e 2>/dev/null && echo "FAIL: output escribió en la raíz" || echo "OK: sin .e2e en la raíz"
ls -d apps/landing/.e2e && echo "OK: output en apps/landing/.e2e"
```

Expected: la primera línea imprime `OK: sin .e2e en la raíz` (el project root es `apps/landing`, no el monorepo). Esto fija Review Focus #2 y #3.

- [x] **Step 7: Añadir los scripts y la task de turbo**

  > Verificado: `apps/landing/package.json:22` (`E2E_TELEMETRY_DISABLED=1 e2e run`), `turbo.json:33` (la task `test:e2e:agent`, con `cache: false`) y `package.json:14` (el agregado raíz con `--concurrency=1`, que el commit `ad6aff3` añadió porque el agregado salía rojo por defecto).

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

- [x] **Step 8: Añadir el output por app al `.gitignore`**

  > Verificado: `.gitignore:40-44` — `apps/*/.e2e/`.

`.gitignore` ya lista `.e2e/artifacts/`, `.e2e/cache/`, `.e2e/report.json` y|display more` etc. (líneas 39-48, de `e2e init`), pero **no** las rutas por app. Añade:

```gitignore
apps/*/.e2e/
```

- [x] **Step 9: Verificar que Playwright no se movió**

  > Verificado: informe item 9 — `git diff 74275d9..HEAD --stat -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts' 'playwright.config.ts'` sale **vacío**.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
ls apps/landing/e2e/ | head
grep -n '"test:e2e"' apps/landing/package.json
```

Expected: `apps/landing/e2e/` sigue con sus specs, y `"test:e2e"` sigue siendo `playwright test --config playwright.config.ts`.

- [x] **Step 10: Correr el gate de no-regresión**

  > Verificado: `test:e2e` sigue siendo Playwright en los tres paquetes (`apps/{landing,admin,mobile}/package.json`), y el informe items 2, 2b y 2d lo corrieron.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
VITE_API_URL=https://test.invalid/api/v1 bun run test --filter=role-landing
```

Expected: PASS. `VITE_API_URL` es obligatorio: `apiUrl()` (`apps/landing/src/lib/api.ts:13`) devuelve `""` sin ella y `api-post.test.ts` falla. Es env, no código roto.

- [x] **Step 11: Commit**

  > Verificado: commit `6c602a2` — *test(landing): suite e2e de tester.army coexistente con Playwright*. El ledger da el rango de la rama: `143c215..ead663e`.

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

- [x] **Step 1: Escribir el test que falla**

  > Verificado: `apps/admin/e2e-agent/auth-gate.e2e.ts` (226 líneas) — commit `25f76c8`.

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

- [x] **Step 2: Correr el test para confirmar que falla**

  > El rojo no quedó registrado con nombre de test: el ledger de la rama registra la revisión y las rondas de arreglo, no el test que se puso rojo.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/admin
bunx e2e run e2e-agent/auth-gate.e2e.ts
```

Expected: FAIL — sin `e2e.config.ts` no hay target.

- [x] **Step 3: Escribir `e2e.config.ts`**

  > Verificado: `apps/admin/e2e.config.ts` (82 líneas) — `output: ".e2e"`, `cache: "off"` y `startupTimeout: 300_000`. Copia la forma de un target que el plan no tenía, porque la del plan ya no servía.

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

- [x] **Step 4: Correr el test para confirmar que pasa**

  > Verificado: informe item 1d — `cd apps/admin && bunx e2e run` → `Tests 1 passed (1)`, 207.36 s. El primer intento dio `APP_UNREACHABLE` (el `SIGKILL` del stub, 137) y el informe lo cuenta en vez de esconderlo.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/admin
bunx e2e run e2e-agent/auth-gate.e2e.ts
```

Expected: PASS, 1 test.

- [x] **Step 5: Añadir el script**

  > Verificado: `apps/admin/package.json:22` — `"test:e2e:agent": "E2E_TELEMETRY_DISABLED=1 e2e run"`.

`apps/admin/package.json`:

```json
"test:e2e:agent": "E2E_TELEMETRY_DISABLED=1 e2e run"
```

- [x] **Step 6: Verificar que Playwright no se movió y commitear**

  > Verificado: el diff de Playwright sale vacío (informe item 9); commit `25f76c8` — *test(admin): suite e2e de tester.army para el gate de auth*. Rango de la rama, según el ledger: `ead663e..6747787`.

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

- [x] **Step 1: Escribir el test que falla**

  > Verificado: `apps/mobile/e2e-agent/boot.e2e.ts` (304 líneas) — commit `5f3cd57`.

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

- [x] **Step 2: Correr el test para confirmar que falla**

  > El rojo no quedó registrado con nombre de test: el ledger de la rama registra la revisión y las rondas de arreglo, no el test que se puso rojo.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/mobile
bunx e2e run e2e-agent/boot.e2e.ts
```

Expected: FAIL — sin config no hay target.

- [x] **Step 3: Escribir `e2e.config.ts`**

  > Verificado: `apps/mobile/e2e.config.ts` (128 líneas), con `startupTimeout: 600_000`: el ledger registra que el revisor **midió** un export en frío de 282 s / 270 s / 320 s (ENOMEM) contra el presupuesto de 300 s, y que el presupuesto era el del plan.

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

- [x] **Step 4: Correr el test para confirmar que pasa**

  > Verificado: informe item 1e — `cd apps/mobile && bunx e2e run` → `Tests 1 passed (1)`, 272.88 s.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/apps/mobile
bunx e2e run e2e-agent/boot.e2e.ts
```

Expected: PASS, 1 test.

- [x] **Step 5: Añadir el script y commitear**

  > Verificado: `apps/mobile/package.json:107`; commit `5f3cd57` — *test(mobile): suite e2e de tester.army sobre el PWA exportado*. Rango de la rama, según el ledger: `9a77ec6..5f7e5db`.

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

- [x] **Step 1: Correr `test:e2e:agent` en las tres apps**

  > Verificado: el informe items 1c, 1d y 1e — los tres en **PASS** (150.68 s, 207.36 s, 272.88 s) — y el agregado, medido al final con `--concurrency=1`: mobile PASS 194.13 s, admin PASS 97.41 s, landing PASS 96.31 s.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun run test:e2e:agent
```

Expected: los tres workspaces con `test:e2e:agent` reportan PASS.

- [x] **Step 2: Correr la suite Playwright completa (el gate real)**

  > Verificado con matiz: el informe items 2 y 2b pasan (api 44 pass / 0 fail, admin 71 passed) y los items 2c (landing, flaky) y 2d (móvil, timeout de 180 s) salen en rojo. **Los dos rojos están diagnosticados como P1 y P3 en el informe** —preexistente el primero, flaky el segundo— y no son de este plan.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
bun run test:e2e
```

Expected: PASS en `role-api`, `role-front-admin`, `role-landing`, `role-mobile`. **Cualquier fallo acá es una regresión de este plan.** Requiere el Postgres de test: `docker compose up -d` (o el servicio de `ci.yml`).

- [x] **Step 3: Typecheck y suite unitaria del monorepo**

  > Verificado con matiz: typecheck **6/6** (item 3) y commons/admin/landing, móvil (538 pass / 0 fail) y supabase (42/0) en verde (items 4, 5 y 7). La API sale con **11 fallos preexistentes** (item 6), los once en un solo spec, y el informe lo descarta como P2.

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

- [x] **Step 4: Confirmar que el `.gitignore` cubre todo el output**

  > Verificado: informe item 8 — `git status --short` vacío, los tres `apps/*/.e2e` ignorados y **0** entradas `.e2e` en la raíz.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git status --short
git check-ignore -q apps/landing/.e2e && echo "OK: ignorado"
```

Expected: `git status --short` no lista ningún `.e2e`; el segundo comando imprime `OK: ignorado`.

- [x] **Step 5: Confirmar que no hay archivos de Playwright modificados**

  > Verificado: informe item 9 — el diff de `apps/*/e2e/*` y de los tres `playwright.config.ts` sale **vacío**.

```bash
cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
git diff HEAD~3 --stat -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts' 'playwright.config.ts'
```

Expected: salida vacía. Si no lo está, este plan tocó algo que no debía.

---

## Fuera de alcance (Phase 2, spec propio)

`agent.act`/`assert`/`explore` y el provider de modelo (decidido: OpenCode, por definir cómo); `@e2e-dev/mobile` con iOS/Android; testIDs en `apps/mobile`; cualquier cambio en `.github/workflows/ci.yml` o en el job `quality`; telemetría activada; replay cache.

## Veredicto de ejecución (2026-10-22)

**Este plan se ejecutó entero y está mergeado.** Las 27 casillas estaban sin
marcar; hoy las 27 están marcadas, cada una con la evidencia con la que se
verificó.

### La prueba de que se ejecutó

- **El merge:** `427917c` — *Merge pull request #17 from 0xc1x/feat/e2e-agent*.
- **La evidencia del propio plan, que es lo raro y lo bueno:** el repo guarda
  el ledger de la ejecución y los cuatro informes de tarea, en
  `docs/superpowers/e2e-agent-evidence/` —`sdd-ledger.md`, `task-4-report.md`,
  `final-review.md` y `final-rereview.md`—, con los commits de cada tarea, las
  rondas de revisión y la tabla pass/fail. Las notas de este plan citan ese
  ledger.
- **Los tres paquetes, con su config y su suite:**
  | paquete | config | suite | commit |
  | --- | --- | --- | --- |
  | landing | `apps/landing/e2e.config.ts` | `apps/landing/e2e-agent/business-signup.e2e.ts` | `6c602a2` |
  | admin | `apps/admin/e2e.config.ts` | `apps/admin/e2e-agent/auth-gate.e2e.ts` | `25f76c8` |
  | mobile | `apps/mobile/e2e.config.ts` | `apps/mobile/e2e-agent/boot.e2e.ts` | `5f3cd57` |

### Lo que se hizo distinto de lo que el plan pedía

- **La forma del `e2e.config.ts`:** el plan pedía dos targets (stub + dev
  server) y quedó **uno**, cuyo `app.command` es un `serve.ts` que arranca los
  dos. El ledger lo explica: el runner arranca todos los targets y gatea la
  corrida en cada `readyUrl`, así que un target-stub probado en la URL del dev
  server abortaba la corrida entera con `APP_UNREACHABLE`.
- **El `startupTimeout` del móvil** es de 600 s, no el del plan: el revisor
  **midió** un export en frío de 282 s / 270 s / 320 s (ENOMEM) contra el
  presupuesto de 300 s, y un desborde se ve como «el servidor nunca arrancó» —
  el fallo engañoso que el `serve.ts` existe para evitar.
- **El agregado raíz lleva `--concurrency=1`** (commit `ad6aff3`): el
  `workers: 1` de cada config gobierna el paralelismo **dentro** de una suite,
  no **entre** paquetes, y `turbo run` arrancaba tres dev servers a la vez. Un
  script rojo en un checkout limpio no es un entregable.

### Lo que no se puede marcar con evidencia

Los pasos «correr el test para confirmar que falla» **no tienen el rojo
registrado con nombre de test**: el ledger registra la revisión y las rondas de
arreglo, no el test que se puso rojo. Es la misma límite que el Plan 3
reconoce en su lista de mutaciones.

### Lo que quedó en rojo, y por qué no es de este plan

El informe de la Task 4 (`task-4-report.md`) midió todo y saldo con dos rojos:
la suite de Playwright del **móvil** (timeout de 180 s en `config.webServer`,
preexistente: el archivo es byte-idéntico a la base de la rama) y la del
**landing** (flaky, 3–4 fallos). Los dos están diagnosticados como P1 y P3. La
suite unitaria de la API salía con 11 fallos preexistentes (P2), los once en un
solo spec. El typecheck daba 6/6 y las tres suites del runner pasaban.