# Design: suite `e2e` (tester.army) coexistiendo con Playwright

Fecha: 2026-10-01
Enfoque aprobado: **A — web primero, mobile nativo como fase 2 separada**
Alcance autorizado: fase web (landing + admin + mobile-web), tests deterministas, sin `agent.*`.
Provider de modelo: **se define después** (decidido: OpenCode). Ningún secret en este ciclo.

## 1. Problema

El repo tiene una suite e2e fuerte: 22 specs / ~123 `test()` en Playwright
(`apps/{admin,landing,mobile}/e2e/`) + 44 tests de ciclo en `apps/api/test/*.e2e-spec.ts`.
Dos huecos reales que Playwright no cubre:

- **Admin requiere `agent.act`/exploración** para flujos que no están escritos a mano, y no hay
  forma de redactar specs para QA dirigida por objetivo.
- **Mobile es solo PWA.** La suite actual prueba el artefacto de `expo export` en navegador
  (`apps/mobile/playwright.config.ts:63`, perfil `Pixel 7`), no el binario nativo. iOS/Android
  reales están sin cobertura.

`e2e` (npm, Apache-2.0, `tester-army/e2e`) cubre ambos: pasos con agente y targets de
dispositivo real vía `@e2e-dev/mobile` + agent-device.

**Restricción dura de este spec:** `e2e` **no reemplaza** Playwright. Se suma.

## 2. Arquitectura

- **Dos suites, dos runners, sin solapamiento.** Playwright queda como está (`test:e2e`).
  `e2e` entra como `test:e2e:agent`, task de turbo propia.
- **Directorios disjuntos:** tests de `e2e` en `apps/<app>/e2e-agent/`. Nunca `e2e/`, que es
  de Playwright. Un nombre que se parece es un nombre que se confunde.
- **Un `e2e.config.ts` por app.** El runner descubre config subiendo desde el cwd hasta la raíz,
  y el directorio del archivo es el project root: el config de la raíz **no alcanza** las apps.
  Además `app.url` es uno por target, y las tres apps sirven en puertos distintos
  (landing 3101, admin 3110, mobile 8085) con stubs distintos (3999, 4110).
- **Fase web = 3 apps, sin `agent.*`.** Tests deterministas con `app`/`screen`/`browser`/
  `expect` de `e2e`. Sin modelo, sin key, sin costo, sin secret. Los `agent.act` entran con el
  provider, en otro ciclo.

### Verificado empíricamente (no asumido)

- `e2e@0.15.1` + `@e2e-dev/web@0.11.1` + `playwright@1.63.0`: `npx e2e list` resuelve y
  `npx e2e run tests/example.e2e.ts` pasó (610 ms). El peer `playwright >=1.63.0 <2` ya lo
  cumple la dep del root.
- Node v26.10.0 (requiere ≥22.12). Bun 1.4.2 con `bunx` en todos los comandos de la doc.
- Sin `services` API en esta versión: los procesos auxiliares (stub-api) se levantan con
  `app.command`, no con una API dedicada.

## 3. Componentes y cambios

Por app: `e2e.config.ts` + `e2e-agent/<feature>.e2e.ts` + script `test:e2e:agent` en
`package.json`. En el root: task `test:e2e:agent` en `turbo.json` y el script homónimo.

1. **Landing (primera fase, PR propio).**
   - `app.command` levanta `e2e/stub-api.ts` (puerto 3999) y `vite dev` con
     `VITE_API_URL` al stub. **Reutiliza** el `stub-api.ts` existente, no uno nuevo.
   - Test tracer: ciclo de onboarding business (`src/routes/business-signup.tsx`) contra el stub.
     Determinista: `app.open()` + `expect(screen.getByRole(...))`. Cero `agent.*`.
   - Ojo: `apps/landing/playwright.config.ts:13-26` documenta que el dev server debe abrir TLS a
     la nada; el `command` de e2e replica el mismo command, no uno improvisado.
2. **Admin (segunda fase).** Reutiliza `e2e/fixtures/api-fixtures.ts` y `e2e/support/admin.ts`
   (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `stubApi`, `failureSentinelFor`). El guard anti-vacuidad de
   `support/admin.ts` es lo que hace la suite creíble; se conserva.
3. **Mobile-web (tercera fase).** `app.command` = `bun run export:web && node e2e/static-server.mjs`
   — el mismo artefacto que ya prueba Playwright, otro runner.

Cada config lleva `output` a su app para que `.e2e/` **no** se escriba en la raíz compartida.

## 4. Flujo de datos y errores

- **Telemetría apagada.** PostHog está on por default; los scripts exportan
  `E2E_TELEMETRY_DISABLED=1`. No entra contenido de app, tests ni credenciales — pero la postura
  de seguridad del repo no lo manda.
- **Sin `.env`:** `e2e` no carga archivos de env por sí mismo. Los valores vienen de `env` en el
  `app.command` / `turbo.json`, nunca de un `.env` nuevo.
- **Sin secrets en este ciclo.** `credentials`/`secrets` se usan solo si el test necesita un valor
  real; el tracer de landing no lo necesita.
- **Anti-vacuidad:** un test que pasa sin probar nada es peor que uno que falta. Cada test fija un
  valor exacto con `expect`, nunca "la pantalla cargó".
- **`cache: 'off'` en el primer ciclo.** El replay cache es lo que hace barato CI después; sin
  modelo no hay nada que cachear, y un `.e2e/cache/` en `.gitignore` solo añade ruido.

## 5. Testing y verificación

- `bun run typecheck` (6/6) y `bun run test` — **con las env de CI.** El baseline de este worktree
  Mayoría-ASAlujo-verificado: `apiUrl()` (`apps/landing/src/lib/api.ts:13`) devuelve `""` sin
  `VITE_API_URL`, así que `api-post.test.ts` falla si no se exporta. No es un repo roto: es env.
- `bun run test:e2e` **debe seguir siendo Playwright y seguir verde** — es el gate de no-regresión
  de este spec.
- `bun run test:e2e:agent` verde por app, medido en el servidor real (no contra `dist` viejo:
  `reuseExistingServer` en false, como en las tres configs de Playwright).
- **Ningún cambio en el job `quality` de `ci.yml`.** Los 25 minutos están asignados; los pasos con
  agente los reventarían. CI para e2e va en un job aparte, no bloqueante, en otro ciclo.

## 6. Fuera de alcance explícito

- **`agent.act` / `agent.assert` / `explore` / bug-bash.** Requieren modelo; se define después.
- **Mobile nativo (`@e2e-dev/mobile`), iOS y Android.** Fase 2, spec propio. Bloqueos verificados:
  sin `ANDROID_HOME` ni `java` (KVM sí funciona: `/dev/kvm` RW, `kvm_intel`, `vmx`), y la doc exige
  **build Release** + `expo prebuild` commiteando `ios/`+`android/` (hoy inexistentes).
- **Tocar `apps/mobile` para testIDs.** El proyecto tiene 6 `testID`, 5 skeletons. En web los
  locators son por rol/nombre accesible y eso ya funciona; agregar testIDs es solo necesario para
  fase 2.
- **Reescribir, mover o borrar specs de Playwright.** Ni una línea.
- **Cambios en `ci.yml`, `quality`, coverage o el ratchet.**
- **`e2e.config.ts` de la raíz** que ya existe de `e2e init`: se retira; la config vive por app.