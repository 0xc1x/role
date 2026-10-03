# Research: `e2e` de tester.army (paquete npm `e2e`)

Fecha: 2026-10-01. Fuentes: **solo primaria** — sitio de documentación del vendor
(`https://e2e.tester.army/docs`, cada página en `.md`), registry de npm, API de GitHub,
`LICENSE` del repo, y los sitios del vendor (`tester.army/pricing`,
`tester.army/llms.txt`, `tester.army/.well-known/agent.json`).

> **Convención del repo.** `docs/` tiene archivos planos (`architecture.md`, `deploy.md`,
> `operations.md`, `security-debt.md`, `query-audit-2026-09.md`) más carpetas temáticas
> (`decisions/`, `improvements/`). **No existe convención para notas de investigación de
> herramientas**, así que esta nota crea `docs/research/` (ruta nueva) y lo declara aquí.
> El texto va en español como el resto de `docs/`. No se commiteó nada.

---

## Veredicto (resumen)

- **Qué es:** un framework/runner de E2E **open source** (Apache-2.0), CLI + SDK + motores
  web y móvil, con pasos agénticos opcionales. **No** es un SaaS obligatorio. Fuente:
  <https://e2e.tester.army/docs>, <https://github.com/tester-army/e2e>,
  <https://raw.githubusercontent.com/tester-army/e2e/main/LICENSE>
- **¿Hace falta el servicio hosteado?** **No, para el framework `e2e`.** Todo corre en la
  máquina/CI del usuario: navegador Playwright local, simuladores/emuladores locales, modelo
  del usuario. El único contacto con TesterArmy es **telemetría anónima** a PostHog
  (opt-out) y `e2e feedback` explícito. Fuente:
  <https://e2e.tester.army/docs/security#outbound-connections>,
  <https://e2e.tester.army/docs/telemetry>
- **SaaS paralelo:** existe `tester.army` como producto cloud aparte (mismo vendor), con su
  propia CLI (`testerarmy`/`ta`), su MCP hosteado y sus planes. **No es requerido por `e2e`.**
  Fuente: <https://tester.army/llms.txt>, <https://tester.army/.well-known/agent.json>
- **Free tier:** el framework `e2e` **no tiene tiers ni cuotas propias** (no hay cuenta ni
  login del vendor). El único costo es el del modelo que el usuario provee. El SaaS
  `tester.army` sí tiene planes (Hobby $99/mo, Startup $299/mo, Enterprise a medida) y 5
  corridas gratis de prueba — pero eso es el SaaS, no el paquete. Fuente:
  <https://tester.army/pricing>
- **Forma de costo:** por consumo de modelo (tokens del LLM que el usuario trae), no por
  licencia del runner. Existe caché de replay que elimina llamadas al modelo en pasos
  verificados. Fuente: <https://e2e.tester.army/docs/agent-steps#cost>,
  <https://e2e.tester.army/docs/cache>
- **Versión npm:** `0.15.1`, publicada **2026-10-01T09:49:27Z** (mismo día de esta nota),
  Apache-2.0, ~3,530 descargas semanales, repo creado 2026-07-22, 451 estrellas.
  Fuente: <https://registry.npmjs.org/e2e>, <https://www.npmjs.com/package/e2e>,
  <https://api.github.com/repos/tester-army/e2e>

---

## 1. Qué es exactamente la oferta: ¿SaaS, CLI open source, o ambos?

**Es (c) ambos, pero son dos productos distintos del mismo vendor, no "el mismo runner
hosteado".**

- El paquete npm `e2e` se describe a sí mismo como "SDK, runner, and CLI for agentic
  end-to-end testing", `type: module`, licencia `Apache-2.0`, `engines.node >= 22.12.0`,
  binario `e2e`, mantenido por dos empleados de TesterArmy con OIDC publishing.
  Fuente: <https://registry.npmjs.org/e2e/latest>
- El docs index se titula "An open framework for agentic end-to-end testing", y la página de
  intro dice "Open source AI testing for web and mobile apps". Fuente:
  <https://e2e.tester.army/docs/llms.txt>, <https://e2e.tester.army/docs>
- La lista completa de conexiones salientes del runner **no incluye ningún endpoint de
  tester.army**: solo PostHog (telemetría), el endpoint del proveedor de modelo configurado,
  probes a `readyUrl`, descarga de navegador de Playwright, el endpoint DevTools que se le
  dé, la API de GitHub (solo con `@e2e-dev/github`), Kernel (solo con `kernel()`) y Expo
  (solo con `easSimulators()`). Fuente:
  <https://e2e.tester.army/docs/security#outbound-connections>
- **Relación con el SaaS:** el README del paquete dice "Built by TesterArmy, the agentic
  testing platform…", es decir el SaaS es la plataforma comercial del mismo vendor y el
  paquete es su framework. El SaaS expone su propia superficie (`testerarmy` CLI `ta`, REST
  API, MCP hosteado en `https://tester.army/mcp`, dashboard) que **no** es la misma que el
  CLI `e2e`. Fuentes: <https://www.npmjs.com/package/e2e>, <https://tester.army/llms.txt>,
  <https://tester.army/.well-known/agent.json>
- **Integraciones oficiales del framework son a terceros, no al propio SaaS:** `@e2e-dev/kernel`
  (Kernel hosted Chromium) y `@e2e-dev/eas` (EAS Simulators). Fuente:
  <https://e2e.tester.army/docs/integrations/index>
- *Inferido (no documentado explícitamente):* que TesterArmy puede usar el framework `e2e`
  por debajo de su plataforma cloud. La telemetría tiene un modo "fleet"
  (`E2E_TELEMETRY_FLEET`) descrito como "a platform that runs e2e on its users' behalf"
  — evidencia indirecta de un integrador que ejecuta `e2e` para terceros, pero no se nombra
  al propio SaaS. Fuente: <https://e2e.tester.army/docs/telemetry#in-a-fleet>

## 2. Instalación y autenticación

**Instalación** (documentado):
- `npx e2e init` / `pnpm dlx e2e init` / **`bunx e2e init`**. Requiere **Node.js 22.12 o
  superior**; en Windows, dentro de WSL. Fuente:
  <https://e2e.tester.army/docs/quickstart>, <https://registry.npmjs.org/e2e/latest>
- `e2e init` escribe `e2e.config.ts`, un test de ejemplo, el *skill* para coding agents y
  la config MCP; **no instala nada** hasta que se confirme, y no pisa archivos existentes.
  Fuente: <https://e2e.tester.army/docs/reference/cli#e2e-init>
- El instalador "follows the project's `packageManager` field or lockfile, then the invoking
  package manager, then npm". Fuente: <https://e2e.tester.army/docs/reference/cli#e2e-init>

**Autenticación: no hay cuenta de tester.army, ni API key propia, ni login de suscripción.**
La única credencial es la del proveedor de modelo que el usuario elige:

| Vía | Cómo | Variable |
| --- | --- | --- |
| Vercel AI Gateway (default del wizard) | `gateway('openai/gpt-6-luna-fast')` del paquete `ai` | `AI_GATEWAY_API_KEY`, o token **Vercel OIDC** sin clave si el proyecto está `vercel link` |
| OpenRouter | `openrouter(...)` + `@openrouter/ai-sdk-provider` | `OPENROUTER_API_KEY` |
| Provider directo (OpenAI, Anthropic, DeepSeek, xAI…) | SDK de AI SDK del provider | `OPENAI_API_KEY`, la del provider, etc. |
| Endpoint local/self-hosted | `@ai-sdk/openai-compatible` + `baseURL` | `apiKey` opcional |
| Suscripción existente | `npx e2e login openai` / `github-copilot` / `spacexai` | tokens en `~/.config/e2e/oauth.json` (o `$XDG_CONFIG_HOME/e2e/oauth.json`) |

Fuentes: <https://e2e.tester.army/docs/models>,
<https://e2e.tester.army/docs/subscriptions>,
<https://e2e.tester.army/docs/reference/environment#model>

Nombres de variables del propio runner (todos `E2E_*` o estándar) — fuente:
<https://e2e.tester.army/docs/reference/environment>

| Variable | Para qué |
| --- | --- |
| `E2E_OAUTH_CREDENTIALS` | JSON de logins de suscripción en CI, en vez del archivo local |
| `E2E_USER_<NAME>_USERNAME` / `E2E_USER_<NAME>_PASSWORD` | override de `credentials.<name>` |
| `E2E_SECRET_<NAME>` | override de `secrets.<name>` |
| `CI` | modo CI (workers=1, retries=1, cache read-only, `.only` rechazado) |
| `E2E_TELEMETRY_DISABLED`, `DO_NOT_TRACK`, `E2E_TELEMETRY_DEBUG`, `E2E_TELEMETRY_FLEET` | telemetría |
| `KERNEL_API_KEY` | solo con el provider `kernel()` |
| `EXPO_TOKEN` | solo con `easSimulators()` (si no, login de `eas-cli`) |
| `GITHUB_TOKEN` / `GH_TOKEN` | solo con `@e2e-dev/github` |
| `APP_URL` | **no la lee el runner**; la lee el `e2e.config.ts` generado |

**Sí existe `AI_GATEWAY_API_KEY`** como nombre de credencial (es del AI Gateway de Vercel, no
propio de e2e). Fuentes: <https://e2e.tester.army/docs/quickstart#use-a-subscription-or-api-key>,
<https://e2e.tester.army/docs/reference/environment#model>

Restricción documentada de credenciales: password/secret deben tener ≥6 caracteres o es
`INVALID_CONFIG` (porque la redacción reemplazaría texto normal). Fuente:
<https://e2e.tester.army/docs/reference/config#secrets>

## 3. Pricing / planes / cuotas

**El framework `e2e` no tiene página de precios ni tiers.** `https://e2e.tester.army/pricing`
devuelve **404** (verificado). No hay signup, ni cuota de corridas, ni techo de gasto del
vendor en ningún lugar de `https://e2e.tester.army/docs/llms.txt` (48 páginas revisadas).

**Lo que sí cuesta:** el proveedor de modelo que el usuario configure, facturado por ese
proveedor. e2e solo *estima y reporta* el costo (lo muestra con `--debug`, por paso: tokens
in/out, % de prompt cache y costo en USD cuando el provider lo reporta). Fuentes:
<https://e2e.tester.army/docs/agent-steps#cost>,
<https://e2e.tester.army/docs/debugging#agent-steps>

**Presupuestos sí existen, pero son del runner, no de facturación** (por paso, por agente,
configurables y solo ajustables a la baja en una llamada):
- `maxModelCalls` (default **25**, rango 1–100) — requests al modelo por llamada.
- `maxSteps` (default **25**, rango 1–100) — acciones de engine comprometidas por `act`.
- `maxInputTokens` (default **64000**, rango 1–1,000,000) — tokens de input por request;
  una pantalla densa se recorta para caber.
- `maxObservationBytes` (default **262144**, 1 KiB–16 MiB), `judgmentTimeout` (default
  30000 ms), `context` ≤ 16384 bytes.
- `assert`/`extract`: 2 model calls (una + un repair). `waitFor`: 0 llamadas mientras la
  pantalla no cambia.
Fuentes: <https://e2e.tester.army/docs/reference/agent#budgets>,
<https://e2e.tester.army/docs/reference/config#agents>

Exceder presupuesto → `STEP_BUDGET_EXHAUSTED` (exit 1); agotar el reloj → `STEP_TIMEOUT`
(exit 1). Fuente: <https://e2e.tester.army/docs/agent-steps#how-a-step-ends>

**Planes del SaaS homónimo (contexto, no requerido por `e2e`)** — fuente primaria:
<https://tester.army/pricing> y <https://tester.army/.well-known/agent.json>

| Plan | Mensual | Anual | Corridas incl. | Concurrencia | Proyectos | Miembros |
| --- | --- | --- | --- | --- | --- | --- |
| Hobby | $99/mo | $83/mo (anual $1,000) | 250 | 3 | 2 | ilimitados |
| Startup | $299/mo | $250/mo (anual $3,000) | 1,000 | 10 | 5 | ilimitados |
| Enterprise | a medida | a medida | custom | custom | custom | ilimitados |

- "Every new team starts with 5 free test runs; no credit card required"; un test run cuenta
  hasta 20 minutos de ejecución. Al agotar la cuota, se bloquean nuevas corridas hasta el día
  1 del mes siguiente. Fuente: <https://tester.army/pricing>

## 4. Modelos / providers

**Cualquier provider de AI SDK sirve**, porque el config recibe una instancia
`LanguageModelV2+` (`{ provider, modelId, doGenerate }`) construida por el usuario. Fuentes:
<https://e2e.tester.army/docs/reference/config#model>,
<https://e2e.tester.army/docs/models>

Rutas documentadas: **Vercel AI Gateway** (`gateway('provider/model-id')`), **OpenRouter**,
**cualquier provider directo** (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/deepseek`,
`@ai-sdk/xai`, …), y **endpoint local/self-hosted** con `@ai-sdk/openai-compatible`.

**No hay modelo por defecto**: "There is no default model or shared API-key variable. The
config selects the model". Fuente: <https://e2e.tester.army/docs/models>

**Modelos "recomendados": no hay lista de recomendados.** El wizard y todos los ejemplos
usan `gateway('openai/gpt-6-luna-fast')`; los ejemplos de varios agentes usan
`anthropic/claude-sonnet-5`, `anthropic/claude-opus-5`, `openai('gpt-6-luna')`,
`grok('grok-4')`. Fuentes: <https://e2e.tester.army/docs/quickstart>,
<https://e2e.tester.army/docs/models>, <https://e2e.tester.army/docs/subscriptions>

Requisito del modelo: para el agente integrado debe soportar **tool calls e imágenes**.
Fuente: <https://e2e.tester.army/docs/models>

**Modelo|Separado**: `judge` sustituye el modelo de `assert`/`waitFor`/`extract`, que por
defecto es el mismo que ejecuta `act`. Fuente: <https://e2e.tester.army/docs/models#a-judge-of-its-own>

**Coste por test/run y cómo se acota:** no hay un "costo máximo por test" en dólares; los
techos son de *model calls*, *acciones* y *tokens de input* por paso (ver Q3), más el caché
de replay que elimina la llamada. Fuente: <https://e2e.tester.army/docs/agent-steps#cost>

**¿Cero llamadas al modelo?** **Sí, documentado explícitamente:** "Tests without agent steps
need no model" / "Tests without agent steps do not need a model", y `e2e init` ofrece la
opción de proveedor **None**. Un test que solo usa `app`, `screen`, `expect` o `fetch` (API
tests) hace **cero** llamadas al modelo. Fuentes:
<https://e2e.tester.army/docs>, <https://e2e.tester.army/docs/models>,
<https://e2e.tester.army/docs/api-testing>, <https://e2e.tester.army/docs/quickstart>
Excepción: un `executor` custom puede implementar `act`/`assert` sin modelo, pero
`waitFor`/`extract` siempre lo requieren. Fuente:
<https://e2e.tester.army/docs/reference/agent>

## 5. Engines: navegadores y plataformas

**Web (`@e2e-dev/web`)**: Chromium, Firefox y WebKit vía **Playwright**; declara `playwright`
como peer dependency (`>=1.63.0 <2`) y no lo instala (si el proyecto ya tiene Playwright,
conserva su versión). Fuentes: <https://e2e.tester.army/docs/reference/web>,
<https://e2e.tester.army/docs>

**Móvil (`@e2e-dev/mobile`)**: simuladores iOS y emuladores Android vía
**agent-device** (Callstack). Requiere **Xcode con runtime de simulador iOS** o **Android SDK
con emulador** en la máquina; `npx agent-device doctor` valida el setup. Fuentes:
<https://e2e.tester.army/docs/mobile>, <https://e2e.tester.army/docs/quickstart>

**¿Hace falta Docker?** **No.** No hay ninguna mención a Docker como requisito en la
documentación de e2e (Docker solo aparece como una *propiedad de telemetría*, `docker: true`,
para describir la clase de máquina). Lo que sí existe: `app.command` arranca **un solo
proceso** por run (un dev server, Metro), y una **API `services` que NO existe en esta
versión**: "Dependency processes (a database, an API mock, a dev server several targets
share) are not started by this version, and `services` is an unknown key wherever it
appears… A services API returns in a later release." Fuentes:
<https://e2e.tester.army/docs/reference/config#services>,
<https://e2e.tester.army/docs/starting-your-app#dependencies>,
<https://e2e.tester.army/docs/telemetry>

**¿Hace falta un device lab en la nube?** **No, es opcional.** Se puede usar device lab
hosteado mediante providers: `easSimulators()` de `@e2e-dev/eas` (EAS Simulators, requiere
`EXPO_TOKEN`; sin Mac ni Xcode en la máquina — *limited access*) o `kernel()` de
`@e2e-dev/kernel` (Chromium hosteado, requiere `KERNEL_API_KEY`). Cualquier otro servicio se
integra como un `DeviceProvider`/`BrowserProvider` propio de unas decenas de líneas. Fuentes:
<https://e2e.tester.army/docs/integrations/eas>,
<https://e2e.tester.army/docs/integrations/kernel>,
<https://e2e.tester.army/docs/mobile#hosted-devices>

**Engine propio**: `defineEngine` / `e2e/engine` para otra plataforma. Fuente:
<https://e2e.tester.army/docs/writing-an-engine>

## 6. Integración CI

**Sí, con docs oficiales y workflows completos de ejemplo** para GitHub Actions
(<https://e2e.tester.army/docs/ci>) y para móvil en GitHub Actions / EAS Workflows / Bitrise
/ Codemagic (<https://e2e.tester.army/docs/mobile-ci>).

Comandos: `npx e2e run` (o `pnpm exec` / `bunx`), `npx e2e run --last-failed`,
`npx e2e run --shard <i>/<n>`, `npx e2e run --reporter list,junit`, `npx e2e run
--max-failures <n>`, `npx e2e run --strict-cache`. Fuentes:
<https://e2e.tester.army/docs/reference/cli#e2e-run>

**Artefactos** (todo bajo `<output>`, default `.e2e`):
- `.e2e/report.json` — documento canónico, siempre escrito si el run llega a sus tests; su
  forma solo cambia con `schemaVersion` (`report-1` hoy).
- `.e2e/junit.xml` — reporter `junit`; un `<testsuite>` por archivo, un `<testcase>` por
  par test-target; los errores de nivel run van en un suite `run`.
- `.e2e/summary.md` y `.e2e/failures/` — reporter `markdown`.
- `.e2e/ai-trace.json` — solo con `--ai-trace` (base de datos devtools del AI SDK).
- `.e2e/artifacts/<target>/<test>/<agent>/attempt-N/` — screenshots, `trace/trace.zip`,
  `video/*.webm|*.mp4`, `downloads/`, `failure/screen.txt`.
- `.e2e/sessions/` — sesiones cifradas, borradas al terminar. `.e2e/cache/` — replay cache
  (independiente de `output`).
Fuente: <https://e2e.tester.army/docs/reference/config#output>,
<https://e2e.tester.army/docs/reference/cli#output>

**Acción oficial de GitHub: no.** No hay un `github-action` de e2e; el flujo es un workflow
propio con `npx e2e run`. Lo opcional es el reporter `@e2e-dev/github`, que postea/edita un
comentario de PR y escribe el job summary (necesita `GITHUB_TOKEN` y
`pull-requests: write`). Fuentes: <https://e2e.tester.army/docs/github>,
<https://e2e.tester.army/docs/ci>

Modo CI (`CI` con valor no vacío/0/false): `retries=1`, `workers=1`, `cache=read-only`,
`test.only` → `ONLY_IN_CI` (exit 2), `command.reuseExisting` ignorado. Fuentes:
<https://e2e.tester.army/docs/ci#what-ci-changes>

Códigos de salida: 0 pass/flaky/skip · 1 fallo de test · 2 config/colección/credenciales ·
3 engine/app/proveedor/artefacto · 4 error interno · 130 interrumpido. Fuente:
<https://e2e.tester.army/docs/reference/cli#exit-codes>

## 7. Replay cache (semántica exacta)

Fuente principal: <https://e2e.tester.army/docs/cache>

**Qué se cachea:** un `agent.act()` se graba (modo `read-write`) **solo al final del intento,
si un paso de verificación posterior pasó**. Se guardan las acciones, descripciones de
targets, texto tipeado, un resumen y checks del estado final (la ruta y hasta 8 controles que
aparecieron). Archivos JSON en `.e2e/cache/`, nombrados por hash de su clave. Fuentes:
<https://e2e.tester.army/docs/cache#what-a-recording-holds>

**Qué sigue corriendo en vivo, siempre:** `agent.assert`, `agent.waitFor`,
`agent.extract`. Además, `e2e explore` y `e2e mcp` **no usan el cache**. Fuente:
<https://e2e.tester.army/docs/cache>, <https://e2e.tester.army/docs/explore#your-config-applies>,
<https://e2e.tester.army/docs/reference/mcp>

**Cómo se reejecuta:** (1) verifica la pantalla inicial: misma ruta (distinto record id,
query o fragmento no invalidan; los retries nunca reejecutan); (2) localiza cada control
grabado por rol, nombre, test id y contexto circundante — espera 15 s por control y se detiene
si hay ambigüedad; (3) verifica ruta final y controles aparecidos, ignorando texto que cambia
con los datos; (4) termina sin llamada al modelo, o entrega el paso al agente desde la
pantalla actual ("handed off"). Fuente: <https://e2e.tester.army/docs/cache#how-a-replay-works>

**Qué invalida un paso cacheado** — una entrada pertenece a un test, target, instrucción y
set de params concretos. Causan **miss**: renombrar el test o el target, cambiar la
instrucción o un param "ordinario", **subir la versión mayor o menor del engine**. **Cambiar
el modelo NO invalida.** Fuente: <https://e2e.tester.army/docs/cache#what-must-match>

Razones de fallo documentadas (`step.cache.reason`): `no-entry`, `retry`, `invalid-entry`,
`truncated`, `wrong-context`, `target-not-found`, `target-ambiguous`, `gap`,
`action-failed`, `action-uncertain`, `viewport-changed`, `end-mismatch`. Fuente:
<https://e2e.tester.army/docs/cache#why-a-step-was-not-replayed>

Límites: se marca `truncated` si el paso took >50 acciones, tipeó un valor/URL >4096 chars o
uno con secret, o actuó sobre un control sin descripción usable; es `gap` una acción que el
cache no puede repetir (project tool mutante, o un valor que el agente *leyó de la pantalla*,
derivó de una fecha o deletreó de píxeles). Fuente:
<https://e2e.tester.army/docs/cache#limits-and-gaps>

**Shareable o local-only:** local por defecto. `e2e init` mete `.e2e/cache/` en
`.gitignore`; **commitearlo es opt-in** (borrar esa línea) para compartir replays con CI y
compañeros. CI queda `read-only` salvo que se ponga `cache: 'read-write'`. Las entradas
contienen texto tipeado verbatim (sin prompts, conversaciones, screenshots ni secretos), así
que la doc pide tratarlas como test data y revisarlas en el PR. Fuentes:
<https://e2e.tester.army/docs/cache#commit-the-replay-cache>,
<https://e2e.tester.army/docs/security#cache-trust>

`--strict-cache` / `cache.strict` convierte una grabación que existe pero ya no reejecuta en
fallo `REPLAY_STALE` (exit 2) **sin llamada al modelo** — sirve para que un replay stale no
sea silencioso. Fuente: <https://e2e.tester.army/docs/cache#fail-on-a-stale-recording>

Store custom: `cache.store` reemplaza el store de archivos (con `CacheStore` exportado desde
`e2e`); los comandos `e2e cache ls|stats|clear` solo leen el store de archivos (exit 2 con
store custom). Fuentes: <https://e2e.tester.army/docs/reference/config#cache>,
<https://e2e.tester.army/docs/reference/cli#e2e-cache>

## 8. `e2e mcp`

Fuente: <https://e2e.tester.army/docs/reference/mcp>

- Es un **servidor MCP sobre stdio** incluido en `e2e`, que corre con el **engine configurado
  en tu proyecto** — `npx e2e mcp [--config <path>] [--target <name>] [--headless]
  [--max-sessions <n>]` (1–16 sesiones, default 4).
- **Funciona contra una app local**: `open_session` "loads the config, starts the target's app
  command, boots the engine, starts one attempt, opens the app URL when the engine can
  navigate". No hay preview URL hosted requerido; la URL puede ser `http://localhost:3000`.
  El servidor no usa el replay cache.
- Cuatro tools de sesión: `open_session`, `tools`, `call`, `close_session`.
- Catálogo de tools de la app, según el engine: `observe`, verbos de acción (`tap`, `type`,
  `press`, `select`, `check`, `scroll`, `drag`, `upload`, `navigate`, `back`, `type_secret`,
  …), `locate`, `screenshot`, tools por punto (`tap_at`, `hover_at`, `type_at`, `press_at`,
  `select_at`), `start_recording`/`stop_recording`, `dismiss_keyboard`, más los project tools
  del `agents.default.tools`.
- Resources: `e2e://guide` y `e2e://guide/{topic}` con topics `setup`, `writing-tests`,
  `agent`, `running`, `explore`, `debugging`, `mcp`, `bug-bash`.
- Enforcement: `POLICY_DENIED` para esquemas `file:`/`data:`/`javascript:` y uploads fuera
  del proyecto; tras un secret fill, `screenshot` y los point tools responden
  `PIXEL_TAINTED` el resto de la sesión.
- En móvil, cada sesión necesita su propio simulador/emulador (un target por device).
- Sesiones cierran a los 30 min idle, a las 4 h, al desconectar el cliente, o en SIGINT/SIGTERM.
- Registro: `e2e init` lo ofrece en `.mcp.json` (Claude Code) y `.cursor/mcp.json` (Cursor).
  Fuentes: <https://e2e.tester.army/docs/reference/mcp#setup>,
  <https://e2e.tester.army/docs/coding-agents>

Nota: el SaaS `tester.army` tiene **otro** MCP server hosted (`https://tester.army/mcp`, OAuth
sin API key) que es un producto distinto. Fuente:
<https://tester.army/.well-known/agent.json>

## 9. Limitaciones y requisitos para este monorepo (Bun + Turborepo + NestJS + TanStack Start + Expo)

**Bun: supportive explícitamente.** Cada bloque de comandos de la doc incluye la variante
bun (`bunx e2e init`, `bunx e2e run`, `bunx e2e mcp`, `bun add -d ai`), y el prompt de setup
para coding agents dice "Run `npx e2e init --yes` (or the pnpm or **bun equivalent** for this
project)". La telemetría distingue `runtime` = `node`, `bun` o `deno`. Fuentes:
<https://e2e.tester.army/docs/quickstart>, <https://e2e.tester.army/docs/reference/cli>,
<https://e2e.tester.army/docs/telemetry>

**Requisitos y fricciones concretas para este repo (todo citado):**

1. **Node ≥ 22.12 declarado como requisito del CLI** (`engines.node: ">=22.12.0"`), aunque los
   ejemplos usan `bunx`. La doc nunca dice explícitamente "Bunsupported" ni "Bun soportado
   como runtime"; solo que los comandos se invocan con `bunx`. Fuentes:
   <https://registry.npmjs.org/e2e/latest>, <https://e2e.tester.army/docs/quickstart>
2. **`playwright` es peer dependency de `@e2e-dev/web` (`>=1.63.0 <2`)** — habría que
   añadirlo al workspace; hoy el repo no declara Playwright. Fuente:
   <https://e2e.tester.army/docs/reference/web>
3. **Un solo proceso de app por target** y **no hay API `services` en esta versión**: la DB de
   test (`postgres-test`, `docker compose`) hay que levantarla antes del run. Fuente:
   <https://e2e.tester.army/docs/reference/config#services>
4. **Descubrimiento de config por directorio**: busca `e2e.config.ts`/`.mts` en el cwd y cada
   padre hasta la raíz del repo; el directorio del archivo es el project root; los globs de
   `tests` son relativos al project root; discovery ignora symlinks. Con un monorepo, cada
   target (api/admin/landing/mobile) necesita su propio `e2e.config.ts` y su propia suite, y
   `--config`/`e2e run` se ejecutan por app. Fuente:
   <https://e2e.tester.army/docs/reference/config#loading>
5. **`tests` default = "cada `*.e2e.ts` bajo `tests/`"**, y los paths se resuelven contra el
   project root; un `output` que caiga dentro de un directorio que escanean los globs de
   `tests` falla la carga del config. Fuente:
   <https://e2e.tester.army/docs/reference/config#loading>
6. **`NODE_OPTIONS` se inspecciona** para decidir si el runner registra sus propios module
   hooks TypeScript; relevante en un repo bun-first. Fuente:
   <https://e2e.tester.army/docs/reference/environment#diagnostics>
7. **Config/test cargados como ESM siempre**, y un config o test escrito con `require`/`module.exports` falla; un paquete de workspace importado **por nombre** debe exportar su `.ts` fuente. Fuente:
   <https://e2e.tester.army/docs/reference/config#loading>
8. **`e2e loads no .env file itself`** — hay que llamar `process.loadEnvFile()` desde el
   config si se quiere un `.env`. Fuente: <https://e2e.tester.army/docs/reference/config#loading>
9. **Móvil (Expo)**: los ejemplos asumen proyecto React Native/Expo con `ios/` y `android/`
   committeados (o `npx expo prebuild` primero); **build Release en ambas plataformas**
   (un build debug carga el JS desde Metro, que el job no levanta); iOS en macOS con Xcode,
   Android en Linux con KVM (los Macs hospedados en Apple Silicon no pueden anidar
   virtualización). Fuentes: <https://e2e.tester.army/docs/mobile-ci>,
   <https://e2e.tester.army/docs/mobile>
10. **Limitaciones de device** documentadas (relevantes para Expo/RN): `placeholder` es el
    único atributo; un tab de RN (`accessibilityRole="tab"`) en iOS tiene rol `other`; un
    `View` plano de RN en iOS no tiene hijos en el árbol (los `filter({ has })` no matchean);
    `display: none` → `toBeAttached` falla; `doubleTap()` en iOS son dos taps a ~285 ms;
    **no hay `test.setup`/sesiones en móvil** (hay que hacer sign-in por test o seedear);
    no hay Playwright trace en móvil; no hay `navigate` ni `app.open('/path')`.
    Fuentes: <https://e2e.tester.army/docs/mobile#what-differs-from-the-web>,
    <https://e2e.tester.army/docs/mobile#known-device-limitations>
11. **Sharding sin merge**: "Each shard writes its own `report.json` and `junit.xml`…
    **Combining the documents into one is not implemented yet**." Fuente:
    <https://e2e.tester.army/docs/ci#sharding>
12. **La API de `services` llega "in a later release"** (nota repetida en config y en
    starting-your-app). Fuentes: <https://e2e.tester.army/docs/reference/config#services>
13. **Telemetría on por default** a `eu.i.posthog.com` (PostHog), opt-out con
    `E2E_TELEMETRY_DISABLED`/`DO_NOT_TRACK`/`e2e telemetry disable`. No envía contenido de
    app, tests, rutas ni credenciales. Fuente: <https://e2e.tester.army/docs/telemetry>
14. **Sin sandbox**: test code y config corren con los permisos del OS, sin sandboxear. Fuente:
    <https://e2e.tester.army/docs/security>
15. **Next.js no se menciona** en ninguna de las 48 páginas del docs index; tampoco hay
    integración específica con TanStack Start, NestJS o Turborepo. No hay conflicto
    documentado con ninguno; tampoco documentado que funcione. *Inferido.*

## 10. Licencia y código abierto

- **Sí, el runner completo es open source**: repositorio público
  `github.com/tester-army/e2e` con `LICENSE` = **Apache-2.0**, y el paquete npm declara
  `"license": "Apache-2.0"`. La API de GitHub reporta `license.spdx_id: Apache-2.0`, 451
  estrellas, creado 2026-07-22, sin archivar, `CONTRIBUTING.md` y `SECURITY.md` enlazados.
  Fuentes: <https://raw.githubusercontent.com/tester-army/e2e/main/LICENSE>,
  <https://registry.npmjs.org/e2e/latest>, <https://api.github.com/repos/tester-army/e2e>,
  <https://www.npmjs.com/package/e2e>
- **Nota de marca distinta en el SaaS**: la página "Open source" de `tester.army` (en el
  índice de llms.txt) menciona "MIT-licensed tools from TesterArmy (CLI, Scout, unbox-ai)",
  que son herramientas *distintas* del paquete `e2e`. El framework `e2e` es Apache-2.0.
  Fuente: <https://tester.army/llms.txt>
- El paquete publica con **SLSA provenance via GitHub OIDC** (`trustedPublisher`,
  `predicateType: https://slsa.dev/provenance/v1`). Fuente:
  <https://registry.npmjs.org/e2e/latest>

---

## Metadatos del paquete (versión y fecha)

| Campo | Valor | Fuente |
| --- | --- | --- |
| Nombre / versión actual | `e2e` **0.15.1** (dist-tag `latest`) | <https://registry.npmjs.org/e2e> |
| Fecha de publish de 0.15.1 | **2026-10-01T09:49:27.893Z** (npm decía "Published 11 hours ago") | <https://registry.npmjs.org/e2e>, <https://www.npmjs.com/package/e2e> |
| Versión anterior | 0.15.0 — 2026-09-30T19:08:28Z | <https://registry.npmjs.org/e2e> |
| Tags de prerelease | `beta: 0.15.0-canary-20260917081546`, `canary: 0.15.0-canary-20260929180659` | <https://registry.npmjs.org/e2e> |
| Primer publish del proyecto | 0.15.0-canary-20260914081513 — 2026-09-14 | <https://registry.npmjs.org/e2e> |
| Total de versiones bajo el nombre `e2e` | 24 (el nombre npm `e2e` existed antes: 2014-2016 fue el paquete OpenPGP de `willscott`) | <https://registry.npmjs.org/e2e> |
| Licencia | Apache-2.0 | <https://registry.npmjs.org/e2e/latest> |
| `engines.node` | `>=22.12.0` | <https://registry.npmjs.org/e2e/latest> |
| Dependencias runtime | 9 (`tsx`, `zod`, `commander`, `picocolors`, `@clack/prompts`, `@vitest/expect`, `@ai-sdk/provider`, `@modelcontextprotocol/sdk`, `pngjs`) | <https://registry.npmjs.org/e2e/latest> |
| Peer deps (todas opcionales) | `ai ^7`, `@ai-sdk/xai ^5`, `@ai-sdk/openai ^4`, `@ai-sdk/openai-compatible ^3` | <https://registry.npmjs.org/e2e/latest> |
| Descargas semanales | ~3,530 | <https://www.npmjs.com/package/e2e> |
| Paquetes hermanos | `@e2e-dev/web`, `@e2e-dev/mobile`, `@e2e-dev/github`, `@e2e-dev/kernel`, `@e2e-dev/eas` | <https://www.npmjs.com/package/e2e> |

---

## No resuelto / no pude verificar

- **No existe página de pricing para el framework `e2e`.** `https://e2e.tester.army/pricing`
  → **404** (verificado). No hay planes, quotas ni "budget ceilings" del vendor en las 48
  páginas de `llms.txt`. Lo que reporté como "sin tiers" es un **silencio documentado**, no una
  declaración explícita de "free forever"; no pude confirmar en fuentes primarias que no exista
  un eventual tier pago o un feature gate para el paquete (p.ej., algún límite de `workers` por
  licencia). Búsqueda web de terceros descartada por la regla de fuentes primarias.
- **No pude confirmar si el SaaS `tester.army` ejecuta el framework `e2e` por debajo.** La
  página `/pricing`, `/llms.txt` y `/.well-known/agent.json` describen el SaaS sin mencionar
  el paquete; el único indicio es el modo `E2E_TELEMETRY_FLEET` ("a platform that runs e2e on
  its users' behalf"). Marcado como **inferido**.
- **Soporte de Bun como runtime, no como package manager.** La doc muestra invocación con
  `bunx` en todas partes y reporta `runtime: bun` en telemetría, pero no encontré una frase que
  diga "Bun is supported" ni "runs under Bun"; el `engines` declarado es Node ≥ 22.12.
  No pude confirmar que el runner **se ejecute** dentro del runtime Bun (el paquete declara
  `engines.node`), solo que los comandos se invocan vía `bunx`.
- **"Modelos recomendados": no existe lista.** Solo ejemplos. Los ids citados
  (`openai/gpt-6-luna-fast`, `anthropic/claude-sonnet-5`, `claude-opus-5`, `gpt-4.5`-family en
  ejemplos de `--debug`) no están respaldados por una recomendación del vendor; no pude
  verificar que esos ids estén disponibles hoy en AI Gateway / Copilot.
- **E2E Simulators está en "limited access"** — el acceso real depende de la cuenta Expo; no
  pude verificar disponibilidad ni precios de EAS Simulators (fuente primaria de EAS no
  consultada, queda fuera del scope del target).
- **Precios del SaaS vs. framework:** los planes de `tester.army/pricing` dicen "test run …
  up to 20 minutes of execution time" y "triggered from chat, the CLI, a GitHub deployment" —
  se refieren al SaaS; **no** vi ninguna afirmación de que contrate "corridas de `e2e`". La
  relación de facturación entre ambos productos no está documentada.
- **No hay GitHub Action oficial** — verificado por ausencia en las 48 páginas, pero no pude
  verificar de forma exhaustiva que no exista un `github/e2e-action` en la org (no busqué en el
  listado completo de repos de la org).
- **Estado del repo vs. hoy:** la nota se escribió el 2026-10-01, el mismo día del publish de
  0.15.1 (publicación muy reciente, ~1 mes de historia del paquete bajo este nombre, 451
  estrellas, `0.x`). Madurez y churn no están documentados por el vendor; es una observación
  derivada de las fechas, no una cita.