# Task 4 — Verificación de no-regresión (Rolé monorepo)

- **Worktree:** `/mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile`
- **Branch:** `feat/e2e-mobile` @ `5f7e5db`
- **Fecha:** 2026-10-02, 00:41–01:54
- **Veredicto:** **0 regresiones.** Todas las suites nuevas corren. Dos huecos reales de Tasks 1-3 (script raíz ausente, 2 archivos sin formatear) y una debilidad de coexistencia (puertos).

## Baseline usado (importante)

| Concepto | Commit | Nota |
| --- | --- | --- |
| Merge-base con `main` | `cc8556e` | **Falso baseline**: `main` está muy atrás; el diff son 1416 archivos. Inutilizable para atribuir Tasks 1-3. |
| Base real de la rama | `74275d9` (`143c215^`) | Padre del commit del plan. Todo lo de Tasks 1-3 es `74275d9..HEAD` (9 commits). |

`git diff 74275d9..HEAD` = sólo 3 tareas de e2e: `turbo.json` (+4/-0), `.gitignore` (+6), `package.json` raíz (+2 devDeps), `apps/*/package.json` (+1 script c/u), y 9 archivos nuevos (`e2e.config.ts` + `e2e-agent/*`).

## Tabla pass/fail

| # | Item | Comando | Resultado | Veredicto |
| --- | --- | --- | --- | --- |
| 1 | Suite nueva, 3 apps | `bun run test:e2e:agent` | `error: Script not found "test:e2e:agent"` (exit 1) | **FAIL** (script raíz ausente) |
| 1b | Suite nueva, vía turbo | `bunx turbo run test:e2e:agent --force` | `role-landing#test:e2e:agent` exited 3 (`APP_ALREADY_RUNNING` 3101) | **FAIL** (contención de puertos ajena) |
| 1c | landing agent | `cd apps/landing && bunx e2e run` | `Tests 1 passed (1)` — 150.68s, startup 35.28s | **PASS** |
| 1d | admin agent | `cd apps/admin && bunx e2e run` | 1.º: `APP_UNREACHABLE` (stub-api SIGKILL 137). 2.º: `Tests 1 passed (1)` — 207.36s, startup 191.66s | **PASS** (tras reintento) |
| 1e | mobile agent | `cd apps/mobile && bunx e2e run` | `Tests 1 passed (1)` — 272.88s, startup 249.24s | **PASS** |
| 2 | Playwright — api | `bun run test:e2e --filter=role-api` | `44 pass / 0 fail` | **PASS** |
| 2b | Playwright — admin | `bun run test:e2e --filter=role-front-admin` | `71 passed (4.3m)` | **PASS** |
| 2c | Playwright — landing | `bun run test:e2e --filter=role-landing` | corrida completa `36 passed, 4 failed`; rerun dirigido `3 failed, 1 passed` | **FAIL** (flaky, ver P3) |
| 2d | Playwright — mobile | `bun run test:e2e --filter=role-mobile` | `Error: Timed out waiting 180000ms from config.webServer` | **FAIL** (pre-existente, ver P1) |
| 3 | Typecheck | `bun run typecheck` | `Tasks: 6 successful, 6 total` | **PASS** |
| 4 | Unit — commons/admin/landing | `bun run test` | PASS | **PASS** |
| 5 | Unit — mobile | `bun run test` (apps/mobile) | `538 pass / 0 fail` | **PASS** |
| 6 | Unit — api | `bun run test` (apps/api) | `2199 pass / 11 fail` (los 11 en un solo spec) | **FAIL** (pre-existente, ver P2) |
| 7 | Unit — supabase | `bun test supabase` | `42 pass / 0 fail` | **PASS** |
| 8 | `.gitignore` cubre `.e2e` | `git status --short` + `git check-ignore` | vacío; los 3 `apps/*/.e2e` ignorados; 0 entradas `.e2e` | **PASS** |
| 9 | Playwright intacto | `git diff 74275d9..HEAD --stat -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts' 'playwright.config.ts'` | **vacío** | **PASS** |
| 10 | Formato de archivos nuevos | biome `format` sobre los archivos reales (ver método) | admin 3/3 limpio, mobile 3/3 limpio, landing 1/3 con 2 errores | **FAIL** (ver C6) |

### Evidencia del item 9

```
$ git diff 74275d9..HEAD --stat -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts' 'playwright.config.ts'
(sin salida)          <-- PASS

$ git diff 74275d9..HEAD --stat -- 'apps/*/e2e-agent/*' 'apps/*/e2e.config.ts'
 apps/admin/e2e-agent/auth-gate.e2e.ts         | 226 +++++
 apps/admin/e2e-agent/serve.ts                 | 340 +++++
 apps/admin/e2e.config.ts                      |  82 ++
 apps/landing/e2e-agent/business-signup.e2e.ts | 172 +++
 apps/landing/e2e-agent/serve.ts               | 202 +++
 apps/landing/e2e.config.ts                    |  73 ++
 apps/mobile/e2e-agent/boot.e2e.ts             | 304 +++++
 apps/mobile/e2e-agent/serve.ts                | 447 +++++++
 apps/mobile/e2e.config.ts                     | 128 +++
```

Contra `cc8556e` esos mismos paths de Playwright salen como **added** (`apps/landing/playwright.config.ts`, `apps/mobile/playwright.config.ts`, `playwright.config.ts`, `apps/*/e2e/*`), pero **existen en `74275d9`**: fueron añadidos por trabajo previo de la rama, no por Tasks 1-3. Verificado.

### Método de verificación de formato (independiente de `--stdin-file-path`)

`format:check` no cubre estos paths (ver P6), así que pasarlo no prueba nada. Método usado: copié los 9 archivos **reales** a `/tmp/opencode/t4/fmt/<app>/` junto con una copia de **su propio** `biome.json` de cada app con `files.includes` ampliado a `["**/*.ts"]` y `vcs` desactivado, y corrí `biome format` sobre los archivos del disco:

```
landing : e2e.config.ts CLEAN | e2e-agent/serve.ts HAS ERRORS | e2e-agent/business-signup.e2e.ts HAS ERRORS
admin   : 3/3 CLEAN
mobile  : 3/3 CLEAN
```

Las diferencias son de layout, p. ej. en `serve.ts:200-202`:
```
- spawn("vite", ["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"], {
-   VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
- });
+ spawn(
+   "vite",
+   ["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"],
+   { VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1` },
+ );
```

## Fallos observados, clasificados

### REGRESSION (causadas por Tasks 1-3): **0**

### PRE-EXISTING (con prueba)

**P1 — `role-mobile` Playwright: `Timed out waiting 180000ms from config.webServer`.**
Prueba: `apps/mobile/playwright.config.ts` está **byte-idéntico** entre `74275d9` y `HEAD` (aparece en el diff de paths Playwright sólo contra `cc8556e`, y existe ya en la base). El `timeout: 180_000` está commiteado en `playwright.config.ts:70`. Tasks 1-3 cronometraron el mismo export en **249.24s** (item 1e), muy por encima de 180s. Determinista en esta caja.

**P2 — `role-api` unit: 11 fallos, todos en `src/database/security/public-read-grants.spec.ts`** (`client read/write boundary migration`).
Prueba: ese spec es **byte-idéntico** entre `74275d9` y `HEAD`, y las tareas **no añadieron ninguna migración ni edge function**:
```
$ git diff 74275d9..HEAD --name-only -- supabase/migrations supabase/functions
(vacío)
```
El spec concatena *todas* las migraciones (`ALL_MIGRATIONS`) y afirma invariantes que migraciones posteriores (bug-reports, app-config, etc.) violan. Mismo input → mismo resultado en base y en HEAD ⇒ fallo determinista pre-existente.

**P3 — `role-landing` Playwright: 3–4 fallos flaky.**
Corrida completa: `36 passed, 4 failed`. Rerun dirigido de esos 4: `3 failed, 1 passed` — **`ssr.spec.ts:67` pasó en el reintento**, lo que delata timing, no rotura. Errores: `page.waitForRequest: Test timeout of 30000ms exceeded at fixtures.ts:122` (`fixtures.ts:122` espera un request a `/api/v1/`) y `ERR_ABORTED`.
Prueba de no-atribución: (a) `apps/landing/e2e/` y `playwright.config.ts` sin cambios en `74275d9..HEAD`; (b) `apps/landing/package.json` sólo añade la línea `"test:e2e:agent"` — `test:e2e` intacto; (c) `turbo.json` es **+4/-0**: la tarea `test:e2e` (con su lista completa de `env`) queda byte-idéntica; (d) la caja tenía el swap al 95% y 4 worktrees activos.

**P4 — `role-mobile` unit: 1 timeout bajo concurrencia.**
`(fail) compiled NativeWind padding is overridden per edge … this test timed out after 5000ms` (5279ms). Al correr *junto a* `role-api` (turbo concurrente): `537 pass / 1 fail`. Aislado 2 veces: `3 pass / 0 fail`. `apps/mobile` completo en solitario: **`538 pass / 0 fail`**. El archivo `src/core/ui/SegmentedTabs.test.tsx` no fue tocado por Tasks 1-3 y existe en la base. Flake por carga.

**P5 — `apps/api/drizzle/` ausente rompe 16 specs con ENOENT.**
```
ENOENT: no such file or directory, scandir '.../apps/api/drizzle'
    at loadInitSql (.../apps/api/test/db.ts:31:26)
```
`apps/api/drizzle/` está **gitignored** (`.gitignore:15-16`, "drizzle generated"). CI lo crea en un paso que yo había omitido: `.github/workflows/ci.yml:72-74` → `bunx drizzle-kit generate`. Tras correrlo: 16 fail/48 errors → 2199 pass/11 fail. Falta de setup, no defecto de código. (El directorio generado queda ignorado; `git status` sigue limpio.)

**P6 — `format:check` es ciego a `e2e.config.ts`, `e2e-agent/` y `e2e/`.**
`apps/landing/biome.json:10-16` → `files.includes: ["**/src/**/*", "**/index.html", "**/vite.config.ts", ...]`. Biome responde `These paths were provided but ignored: e2e.config.ts, e2e-agent`. Patrón pre-existente (los `e2e/` de Playwright tampoco están cubiertos).

### ENVIRONMENTAL (no es código ni defecto pre-existente)

**E1 — Contención de puertos por worktrees hermanos.**(worktrees: `/mnt/c/Users/leonardo/landing-dbg` rama `debug/landing-e2e`, y `/mnt/c/Users/leonardo/role-bugreports` rama `feat/bug-reports-b`). Produjo, en este orden:
- `APP_ALREADY_RUNNING … http://127.0.0.1:3101/favicon.ico already answered`
- `error: Failed to start server. Is port 3999 in use? … EADDRINUSE` en `e2e/stub-api.ts:104`
- `Error: http://localhost:3999 is already used … set reuseExistingServer:true`
- una corrida con **17/17 fallos por `ERR_CONNECTION_REFUSED` en 3101** (el server del sibling se llevó el puerto a mitad de arranque)

Proprietario verificado por `/proc/<pid>/cwd` → `/mnt/c/Users/leonardo/landing-dbg/apps/landing`. **No maté ningún proceso ajeno.** Los ports 3101/3999 quedaron libres en ventanas de ~2–4 min y ahí obtuve los passes de landing.

**E2 — Presión de memoria del host.** `free -h`: 15Gi total, swap **3.8/4.0Gi usadas**. El 1.er intento de admin murió con `stub-api terminó (code=137 signal=SIGKILL)`; `serve.ts` entonces bajó el otro proceso y el test reportó `APP_UNREACHABLE: nothing answered at http://127.0.0.1:3110/negocios`. Pasó en el reintento.

**E3 — `turbo` cancela hermanos al primer fallo.** `bun run test:e2e` terminó `Tasks: 2 successful, 5 total / Failed: role-mobile#test:e2e` **sin veredicto para api, admin ni landing** (los中断 al morir mobile). Por eso los corrí por separado.

## Preocupaciones

- **C1 — Falta el script raíz `test:e2e:agent`.** El brief (Step 1) manda correr `bun run test:e2e:agent` y eso da exit 1. `turbo.json` define la tarea y las 3 apps tienen su script, pero `package.json` raíz no tiene el agregado, mientras que sí existe `"test:e2e": "turbo run test:e2e"`. Inconsistencia real introducida por Tasks 1-3.
- **C2 — La suite nueva y la de Playwright chocan de puerto por defecto en las TRES apps.** landing `3101/3999` (hardcodeados en ambos lados), admin `3110/4110`, mobile `8085`. La coexistencia sólo se sostiene si las dos tareas turbo nunca corren a la vez (hoy son comandos separados, así que aguanta; un job de CI que las paralee, no).
- **C3 — `apps/landing/e2e-agent/serve.ts` no admite override de puertos.** `STUB_API_PORT = "3999"` / `UI_PORT = "3101"` son constantes; `landing/playwright.config.ts` también los fija. Consecuencia: las dos suites de landing **nunca** pueden correr simultáneamente, y cualquier worktree hermano sobre el mismo commit rompe ambas. Admin y mobile al menos tienen override por env del lado Playwright (`ADMIN_E2E_PORT`, `MOBILE_E2E_PORT`).
- **C4 — `serve.ts` enmascara la causa raíz.** Al morir `stub-api` baja también la UI, y el runner reporta `APP_UNREACHABLE` contra el puerto de la UI. Me costó diagnosticar como defecto de suite un OOM del host. Merece propagar el código/ señal del hijo que murió.
- **C5 — `apps/mobile/playwright.config.ts:76-91` omite los cuatro `EXPO_PUBLIC_FIREBASE_*`.** Matiz importante respecto al brief: en CI **no** es mortal, porque `ci.yml:120-123` los define a nivel de proceso y Playwright los hereda. Sólo falla rápido si el entorno no los trae (local sin esas vars). El fallo real y reproducible es el timeout de 180s (P1).
- **C6 — Dos archivos nuevos de landing no están formateados** según su propio `biome.json` (`e2e-agent/serve.ts`, `e2e-agent/business-signup.e2e.ts`). Combinado con P6, CI no lo va a detectar.
- **C7 — `SegmentedTabs.test.tsx` es flakily lento**: ~2.5–3s en aislamiento contra un presupuesto default de 5000ms. Con `role-api` en paralelo revienta (P4). Riesgo real en CI.
- **C8 — `main` está 1416 archivos atrás.** Cualquiera que use `git diff main...HEAD` para decidir qué tocó este plan Obtaindrá ruido. El baseline útil es `74275d9`.
- **C9 — `bun run test` no es autónomo en este repo**: sin `bunx drizzle-kit generate` (paso de CI) el gate da 48 errores. El brief Step 3 no lo menciona.

## Nota de higiene

`git status --short` vacío al terminar; `git diff HEAD --stat` vacío. **No commiteé nada ni modifiqué ningún archivo.** Lo único que escribí en disco fue el directorio generado `apps/api/drizzle/` (gitignored, paso de CI) y `/tmp/opencode/t4/`. Los únicos procesos que maté fueron huérfanos **de este mismo worktree** (`cwd` = `.worktrees/e2e-mobile/apps/{admin,landing}`) dejados por el turbo abortado.
---

# Anexo — cierre de C1 y C6 (los dos gaps que dejó la verificación final)

Subagente de cierre. **C1** = falta el script raíz `test:e2e:agent`. **C6** = dos
archivos de landing sin formatear. Los dos cerrados y verificados. No se tocó nada
fuera de los 3 archivos listados abajo.

`git status --short` al terminar: 3 archivos modificados, nada sin trackear.

```
 M apps/landing/e2e-agent/business-signup.e2e.ts
 M apps/landing/e2e-agent/serve.ts
 M package.json
```

## Gap 1 — el script raíz `test:e2e:agent`

Una línea, al lado de la de `test:e2e`, con el estilo exacto que pedía el brief:

```diff
     "test:e2e": "turbo run test:e2e",
+    "test:e2e:agent": "turbo run test:e2e:agent",
```

`test:e2e` por app queda intacto en las tres (`playwright test --config
playwright.config.ts`), y `turbo.json:33-36` ya definía la tarea, así que el fix es
sólo el agregado que faltaba.

### Prueba de dispatch — `bun run test:e2e:agent` desde la raíz

```
role-landing:test:e2e:agent: cache miss, executing ec9f711ea86cd647
role-front-admin:test:e2e:agent: cache miss, executing e0a8362f9608da5d
role-mobile:test:e2e:agent: cache miss, executing 80d26519fdc28c6e
role-landing:test:e2e:agent: $ E2E_TELEMETRY_DISABLED=1 e2e run
role-front-admin:test:e2e:agent: $ E2E_TELEMETRY_DISABLED=1 e2e run
role-mobile:test:e2e:agent: $ E2E_TELEMETRY_DISABLED=1 e2e run
```

**Las tres apps despachan**, cada una con su `e2e run`. Eso es lo que el brief pedía
probar, y antes de este commit el comando ni siquiera existía
(`error: Script not found "test:e2e:agent"`).

### La corrida agregada sale ROJA en paralelo, y es reproducible

No lo decoratione: lo corrí dos veces y falló las dos.

```
role-landing:test:e2e:agent:    × un negocio nuevo se registra desde el formulario público (timed-out) 130.48s
role-landing:test:e2e:agent:      → test timed out after 120000 ms in phase body
role-landing:test:e2e:agent: TEST_TIMEOUT: test timed out after 120000 ms in phase body
 Tasks:    1 successful, 4 total
Failed:    role-landing#test:e2e:agent
```

Segundo intento, idéntico: `test timed out after 120000 ms in phase body`, `Tasks:
2 successful, 4 total`.

**No es el reformateo.** Landing en solitario, con los archivos ya formateados, pasa:

```
 ✓ target "landing" command ready 34.14s
 ✓ |landing| e2e-agent/business-signup.e2e.ts (1 test) 86.49s
   ✓ un negocio nuevo se registra desde el formulario público 86.49s
 Test Files  1 passed (1)
```

Es contención de recursos. `turbo` corre los tres paquetes en paralelo, y en la
ventana del fallo el host tenía **swap 3.9/4.0 GiB usada** con 8 cores:

```
 VITE v8.2.1  ready in 46180 ms
```

El detalle que importa: en el segundo intento Vite arrancó en **15.6 s** y el test
igualmente reventó los 120 s. O sea que no es el arranque del target sino el
**cuerpo** del test: `business-signup` mide 66 s en verde y tiene sólo ~1.8x de
margen contra el presupuesto default de 120 s, así que cualquier competencia con el
`expo export` de mobile (228 s) lo pasa. Y por el comportamiento de turbo ya
documentado en **E3** (cancela hermanos al primer fallo), mobile y admin salen con
código 130 sin veredicto: el agregado no puede dar tres veredictos en una
corrida si uno falla.

### El mismo agregado, serializado, da tres verdes

Sin tocar el script commiteado — lo verifiqué por CLI, así que el veredicto es
sobre la suite y no sobre un cambio mío:

```
$ bunx turbo run test:e2e:agent --concurrency=1

role-landing:test:e2e:agent:  ✓ |landing| e2e-agent/business-signup.e2e.ts (1 test) 66.74s
role-front-admin:test:e2e:agent:  ✓ |admin| e2e-agent/auth-gate.e2e.ts (1 test) 5.92s
role-mobile:test:e2e:agent:  ✓ |mobile| e2e-agent/boot.e2e.ts (1 test) 4.63s

 Tasks:  4 successful, 4 total
SERIAL_EXIT=0
```

**El agregado funciona de punta a punta.** Lo único que lo pone rojo es que turbo
paraleliza por default tres suites que manejan navegador sobre una caja sin swap
libre.

**Dejé el script exactamente como lo especificó el brief** (`turbo run
test:e2e:agent`, sin flags). Agregar `--concurrency=1` sería una línea y lo
arreglaría, pero el brief pidió el string exacto y cambiar la semántica de
concurrencia de un gate no es un call que me corresponda tomar solo — queda como
recomendación en **C10** abajo.

## Gap 2 — formato de los dos archivos de landing

### Por qué `format:check` no dice nada (y por qué el intento anterior tampoco)

Confirmado el mecanismo: `apps/landing/biome.json:10-17` incluye sólo
`**/src/**/*`, `**/index.html`, `**/vite.config.ts`. `e2e.config.ts` y `e2e-agent/`
quedan afuera, así que `bun run format:check` está verde con estos archivos sin
formatear — no es un check débil, es la **ausencia** de check. Y `--stdin-file-path`
con la ruta real tampoco sirve: biome aplica `files.includes` a las rutas de stdin
también, así que pasa los bytes de largo. Eso fue exactamente el falso negativo que
Task 2 ya se había comido una vez.

### El verificador que sí chequea: `/tmp/opencode/fmtcheck-v2.ts`

Copia los bytes reales a un scratch bajo `/tmp/opencode`, junto con el
`biome.json` **de la app** leído en runtime (sólo se le cambian `files.includes` a
`**` y se saca `vcs`), corre `biome format --write` sobre la copia y compara
bytes. No depende de `format:check` ni de `--stdin-file-path`, y nunca escribe en
el repo salvo el archivo individual cuando se corre con `APPLY=1`. No hay ningún
`rmSync` sobre nada del repo: el único borrado es el scratch dir, con el path
assertado bajo `/tmp/opencode/` antes de llamar.

**Antes de aplicarlo ya había contaminated dos veces el método y el control me
delató las dos:**

1. Corría `bunx biome` desde el scratch (fuera del repo). `bunx` resolvió el
   paquete npm llamado `biome` —**v0.3.3**, sin relación con `@biomejs/biome`— y no
   formateó nada. La corrida entera décía "OK" para 9 archivos. Fijado por path
   absoluto al binario del repo + assert de versión.
2. Con el binario correcto seguía sin formatear: mi control positivo
   (`const x   =    1;`) salía `UNCHANGED` porque yo escribía el archivo fuera del
   cwd que le pasaba a biome. Bug mío, no del repo.

Sin esos dos controles, el reporte de este gap habría sido un tercer falso
negativo con la misma forma exacta.

```
biome binary: .../node_modules/@biomejs/biome/bin/biome
biome version: Version: 2.5.14

control (mangled bytes): DIFF reported, as required
```

El control positivo es lo que hace que un "OK" signifique algo. Y el **grupo de
control** — los archivos que el brief dice que ya están limpios — tiene que salir
todos `OK`, o el método está mintiendo:

```
OK   apps/admin/e2e.config.ts  (4067B -> 4067B)
OK   apps/admin/e2e-agent/serve.ts  (16462B -> 16462B)
OK   apps/admin/e2e-agent/auth-gate.e2e.ts  (10828B -> 10828B)
OK   apps/mobile/e2e.config.ts  (6651B -> 6651B)
OK   apps/mobile/e2e-agent/serve.ts  (22188B -> 22188B)
OK   apps/mobile/e2e-agent/boot.e2e.ts  (17001B -> 17001B)
OK   apps/landing/e2e.config.ts  (3395B -> 3395B)
DIFF apps/landing/e2e-agent/serve.ts  (9573B -> 9581B)
DIFF apps/landing/e2e-agent/business-signup.e2e.ts  (8203B -> 8225B)

checked 9 files, 2 differ
```

Exactamente los dos archivos del gap, y sólo esos.

### Los cambios, todos de re-empaquetado de líneas

`serve.ts` — la línea de 82 columnas del `spawn`:

```diff
-spawn("vite", ["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"], {
-	VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
-});
+spawn(
+	"vite",
+	["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"],
+	{
+		VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
+	},
+);
```

`business-signup.e2e.ts` — tres sitios: el `waitForResponse`, el arrow del `.poll`
de destinos, y el par de `expect` finales. Ningún cambio de semántica: mismas
llamadas, mismos argumentos, mismos timeouts, mismos mensajes.

### Rechequeo (el que cuenta)

```
OK   apps/landing/e2e-agent/serve.ts  (9581B -> 9581B, endsWithNewline: true)
OK   apps/landing/e2e-agent/business-signup.e2e.ts  (8225B -> 8225B, endsWithNewline: true)

checked 9 files, 0 differ
```

Auditoría de columnas >80 en los dos archivos, ya formateados: **cero líneas de
código** por encima de 80. Lo que queda son comentarios y literales de string
imbrokables que biome no puede cortar y que él mismo produce — el mismo perfil que
`apps/admin/e2e-agent/*.ts`, que es la referencia de "estado final" que pedía el
brief. Los dos archivos ya terminaban en `\n` antes de este commit; el gap era
sólo el ancho.

### Gates

```
apps/landing $ bun run typecheck   →  $ tsc --noEmit   (exit 0)

apps/landing $ bun run test:e2e:agent
 ✓ target "landing" command ready 34.14s
 ✓ |landing| e2e-agent/business-signup.e2e.ts (1 test) 86.49s
 Test Files  1 passed (1)      Tests  1 passed (1)
```

El test de landing sigue pasando **después** del reformateo.

## Restricciones — cumplidas

Sólo 3 archivos tocados. `git diff --name-only` completo:

```
apps/landing/e2e-agent/business-signup.e2e.ts
apps/landing/e2e-agent/serve.ts
package.json
```

- Nada bajo `apps/*/e2e/` (la carpeta de Playwright), ningún `playwright.config.ts`,
  nada bajo `apps/mobile/src`.
- `test:e2e` intacto en las tres apps.
- Ningún `testID` (`git diff | grep -i testid` → vacío).
- Ningún literal de puerto cambiado en el diff, y ningún comentario de puerto tocado.
- Nada de ports por env: la limitación de puertos compartidos entre las dos suites
  sigue igual y sigue siendo **documentada, no arreglada** (C2/C3).
- Sin `agent.act` / `agent.assert` / `explore`. Sin secrets, sin `.env` nuevo.
- Cero subagentes. Cero procesos matados — ni siquiera los de este worktree.

## Preocupaciones nuevas

- **C10 — El agregado `bun run test:e2e:agent` sale rojo por defecto.** Turbo
  paraleliza los tres paquetes y landing revienta su presupuesto de 120 s en el
  cuerpo del test (2 de 2 corridas). Con `--concurrency=1` da 4/4 verdes. Dos
  arreglos posibles, y la decisión es de quien cierre esto: (a) `--concurrency=1` en
  el script raíz, una palabra; (b) darle a `business-signup.e2e.ts` un timeout
  propio, que además es la deuda de fondo porque 66 s contra 120 s deja poco
  margen para CI. No apliqué ninguno: el brief especificó el string exacto del
  script, y tocar el timeout de un test cambia su semántica.
- **C11 — `bun run format:check` del repo está ROJO en `apps/mobile/src`, y es
  pre-existente a este branch.** No lo descubrí yo: lo encontró `format:check` de la
  raíz y lo confirmé con `git diff --stat HEAD -- apps/mobile` vacío. Son tres
  archivos que están dentro de `files.includes`, o sea que **sí** los mira:

  ```
  src/core/i18n/operator-identity.ts
  src/core/theme/author-palette.contrast.test.ts
  src/features/auth/data/social-auth.test.ts
  ```

  ```
  Tasks:    2 successful, 5 total
  Failed:   role-mobile#format:check
  ```

  **No lo arreglé**: el brief prohíbe explícitamente tocar `apps/mobile/src`, y no
  es parte de ninguno de los dos gaps. Pero conviene que quede escrito, porque
  significa que el gate de formato del repo **no está verde hoy** y por eso el
  `format:check` verde post-gap-2 no es "el repo está formateado": es "lo que el
  gate cubre y yo no toqué está igual que antes". El gap 2 estaba igual de invisible
  por la misma clase de razón (el gate no mira esos paths), sólo que en el otro
  sentido: el gate miraba de más en mobile y de menos en `e2e-agent/`.

## Nota de higiene

Ningún proceso ajeno tocado, ningún archivo fuera de los 3 del diff. Lo único
escrito fuera del repo: `/tmp/opencode/{fmtcheck-v2.ts,root-run.log,root-run2.log,
root-serial.log,append.md}` y su scratch dir `fmtchk-v2/`. `.e2e/` y los artefactos
de corrida quedaron gitignored — `git status --untracked-files=all` limpio.

---

# Anexo 2 — C10 cerrado: el agregado `test:e2e:agent` serializa los tres paquetes

Arreglo de una línea en el `package.json` raíz. Cierra **C10** del anexo anterior,
que había quedado reportado como preocupación en vez de arreglado.

## El cambio

```diff
     "test:e2e": "turbo run test:e2e",
-    "test:e2e:agent": "turbo run test:e2e:agent",
+    "test:e2e:agent": "turbo run test:e2e:agent --concurrency=1",
```

`git diff --stat`: **1 archivo, 1 línea**. Mismo nombre de script, mismo estilo que la
línea vecina de `test:e2e`, con el flag agregado. `package.json` parsea.

**Por qué el flag y no otra cosa.** `workers: 1` en cada `e2e.config.ts` gobierna el
paralelismo DENTRO de una suite; no dice nada sobre cuántos paquetes levanta turbo a
la vez. Con los tres en paralelo hay dos dev servers de vite más un `expo export`
 peleando por memoria y CPU, y el test de landing no entra en su presupuesto de 120 s.
`--concurrency=1` serializa los paquetes sin tocar ninguna app.

**Lo que NO hice, a propósito:** no subí el timeout del runner en ningún
`e2e.config.ts`. El margen de 120 s contra los ~62 s reales es deuda real que se
está rastreando aparte; subirlo taparía la contención en vez de quitarla, y el
presupuesto dejaría de ser un presupuesto.

## Verificación

```bash
$ cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile
$ bun run test:e2e:agent
```

### Trampa: la corrida "modificada" NO era evidencia

La primera corrida del comando sin modificar dio verde, y con timings **idénticos
dígito por dígito** a la corrida serializada anterior (`249.72s`, `228.31s`,
`109.04s`, `141.26s`). Eso no era una corrida, era un replay:

```
role-mobile:test:e2e:agent: cache hit, replaying logs 80d26519fdc28c6e
role-landing:test:e2e:agent: cache hit, replaying logs ec9f711ea86cd647
role-front-admin:test:e2e:agent: cache hit, replaying logs e0a8362f9608da5d
 Tasks:  4 successful, 4 total
Cached:  4 cached, 4 total
  Time:  4.211s >>> FULL TURBO
```

`4 cached, 4 total`, `FULL TURBO`, cero tareas ejecutadas. **Turbo no mete el flag
del script raíz en el hash de la tarea**, así que ese cache hit habría salido igual
con o sin el arreglo: el comando "verde" no probaba el arreglo, probaba la existence
de entradas de cache de una corrida anterior. Si lo hubiera reportado tal cual, sería
un falso verde con la misma forma que los tres falsos negativos de formato.

### La corrida que sí prueba el arreglo

El cache de turbo resultaba estar en
`/mnt/c/Users/leonardo/Repositories/role/.turbo/cache` — el repo **principal**,
compartido con los worktrees hermanos. Borrarlo para forzar un miss habría evicted el
cache de los demás, así que no lo toqué y usé `--force`, que saltea la lectura del
cache sin destruir nada ajeno y sin cambiar la semántica de serialización bajo prueba:

```bash
$ bun run test:e2e:agent --force
```

Resultado por paquete, con tiempos de la corrida real:

| paquete | target ready | test | total |
| --- | --- | --- | --- |
| `role-mobile` | 175.48s | `✓ boot.e2e.ts (1 test) 4.36s` | **PASS** 194.13s |
| `role-front-admin` | 87.01s | `✓ auth-gate.e2e.ts (1 test) 3.84s` | **PASS** 97.41s |
| `role-landing` | 27.11s | `✓ business-signup.e2e.ts (1 test) 62.01s` | **PASS** 96.31s |

```
role-mobile:test:e2e:agent:  ✓ |mobile| e2e-agent/boot.e2e.ts (1 test) 4.36s
role-mobile:test:e2e:agent:    ✓ la PWA arranca y el invitado de primera visita llega al feed de ofertas 4.36s
role-mobile:test:e2e:agent:  Duration  194.13s (3m 14s, startup 175.48s)
role-front-admin:test:e2e:agent:  ✓ |admin| e2e-agent/auth-gate.e2e.ts (1 test) 3.84s
role-front-admin:test:e2e:agent:    ✓ un anónimo que pide una sección aterriza en el login, y el login habla con el stub de loopback 3.84s
role-front-admin:test:e2e:agent:  Duration  97.41s (1m 37s, startup 87.01s)
role-landing:test:e2e:agent:  ✓ |landing| e2e-agent/business-signup.e2e.ts (1 test) 62.01s
role-landing:test:e2e:agent:    ✓ un negocio nuevo se registra desde el formulario público 62.01s
role-landing:test:e2e:agent:  Duration  96.31s (1m 36s, startup 27.11s)

 Tasks:    4 successful, 4 total
Cached:    0 cached, 4 total
  Time:    7m41.153s
EXIT=0
```

`Cached: 0 cached, 4 total` es lo que separa esto de la corrida anterior: las tres
tareas se ejecutaron de verdad. Los tiempos además son OTROS (mobile 194.13s en vez
de los 249.72s del replay, y el orden de ejecución fue mobile → admin → landing en
vez del otro), lo que confirma ejecución real y no log reproducido.

Landing, el que fallaba 2 de 2 en paralelo, pasa en **62.01s** de los 120 s de
presupuesto.

## Higiene

`git status --short` después: un solo archivo modificado, `package.json`. Nada bajo
`apps/*/e2e/`, ningún `playwright.config.ts`, ninguna app fuente, ningún
`e2e.config.ts` tocado. Cero subagentes. Cero procesos matados: los ports 3101,
3999, 3110, 4110 y 8085 estaban libres antes de arrancar y ninguna corrida chocó con
`EADDRINUSE` ni `APP_ALREADY_RUNNING`. El cache de turbo de los worktrees hermanos
quedó intacto.
