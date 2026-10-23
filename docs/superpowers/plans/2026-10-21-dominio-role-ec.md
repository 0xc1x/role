# Plan 6 — El dominio es `role.ec`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el repositorio diga `role.ec` donde dice `role.app` —el dominio que se
adquirió—, y que el **ledger de migraciones describa** el dominio que producción ya
usa, para que un `supabase db push` a un entorno nuevo no se rompa.

**Architecture:** Dos piezas y un hueco. (1) El **código**: la identidad del sitio
(`FALLBACK_SITE_URL`, canonical, og:url, sitemap), los **fallbacks de correo** que el
producto puede mostrar a una persona, y los tests que fijan esa identidad. (2) El
**ledger**: producción corre en `role.ec` desde hace meses, pero **ninguna fila del
ledger lo escribe** (`docs/security-debt.md` §8), así que el directorio de migraciones
no describe la base que hay. La pieza (2) es una **migración de datos** idempotente,
aplicada por `apply_migration` y verificada con `md5sum`.

**Tech Stack:** Postgres 17 (Supabase) con migraciones por `apply_migration`; TanStack
Start (apps/landing, apps/admin); Expo (apps/mobile); NestJS (apps/api); `bun:test`.

**Spec:** `docs/security-debt.md` §7 y §8 (el dominio y su deuda) y
`docs/superpowers/specs/2026-10-13-business-staff-access-design.md` (§9.1: el alias
del empleado ya es `@{slug}.role.ec`).

## Global Constraints

- **Toda migración entra por `apply_migration`**, nunca por `execute_sql` ni por el
  dashboard. Tras aplicar: renombrar el archivo a la versión que asignó el servidor y
  confirmar `md5sum` del archivo == `md5(statements[1])` del ledger. **Los archivos
  sellados no se editan**: se corrige con una migración nueva.
- Los archivos de migración terminan en `;` y sin salto de línea final.
- **El dominio del producto es `role.ec`.** `role.app` es el dominio viejo y queda
  sólo donde hay una razón escrita para seguir ahí.
- `bun run typecheck`, `bun run test` y `bun run build` verdes. Conventional commits,
  sin `Co-Authored-By` ni atribución de IA.

## La regla del alcance (lo que cambia y lo que no)

**Cambia a `role.ec`** — todo lo que el producto puede **mostrar a una persona** o
**anunciar a un buscador**:

| zona | qué |
| --- | --- |
| `apps/landing` | `FALLBACK_SITE_URL` (`site-url.ts`), el mensaje de arranque, los **fallbacks de correo** (`hola@`, `negocios@`), la prosa que los explica, el `.env.example`, el README y **los tests que fijan el canonical/og:url** |
| `apps/mobile` | los **fallbacks de correo** de `strings.ts` (`supportEmail`, `contactEmail` ×2) |
| `apps/admin` | el placeholder `soporte@role.app` del formulario de `app_config` |
| `apps/api` | el `EMAIL_FROM` de `.env.example` |
| `supabase/migrations` | **una migración nueva** que registra los valores que producción ya tiene |

**NO cambia** — y cada caso tiene su razón escrita:

| lo que queda en `role.app` | por qué |
| --- | --- |
| `social.facebook_url`, `social.instagram_url`, `social.tiktok_url`, `social.youtube_url` | son **cuentas en dominio ajeno** (`facebook.com/role.app`): reescribirlas rompe el enlace de cada footer |
| las 53 apariciones de `supabase/migrations/` | son el **registro histórico**: los archivos sellados no se editan. El que.normaliza el dominio (`20260927053728`) y el que confirma el admin (`20260927141336`) son la prueba de lo que se hizo y de cuándo |
| los fixtures de test sin valor de dominio (`antes@role.app`, `persona@role.app`, `cdn.role.app`, un callback OAuth de ejemplo) | no son defaults ni identidad: son datos arbitrarios que el test usa para otra cosa. Cambiarlos no arregla nada y ensucia el diff |
| las aserciones `not.toContain("https://role.app")` del e2e de la landing | son la **guarda** de este mismo cambio: el sitio no debe anunciar el dominio viejo. Se quedan y pasan a ser la prueba de que no se coló |
| la prosa histórica de los planes (`docs/superpowers/plans/*.md`) | es el **registro de lo que se midió** en su día. Se anota (como el spec §5.4 con «Actualizado por el Plan 3»), no se reescribe |

## Fuera de este plan (decidido, 2026-10-21)

- **El teléfono de soporte.** `docs/security-debt.md` §7: es una decisión de negocio y
  no se inventa un número. Los correos que sí se corrigen son los de esta lista; el
  número sigue siendo deuda abierta.
- **DNS, Vercel, `CORS_ORIGINS` y las URLs de redirección de Supabase**: son
  configuración de la infraestructura, fuera del repositorio. Se listan como acciones
  del partner en el informe final.
- **`role.app` en las plantillas y componentes de correo**: la migración original
  (`20260927053728`) ya los movió; la migración nueva los vuelve a barrer por si
  acaso, pero no se espera que encuentre nada.

---

### Task 1: La migración que registra el dominio en el ledger

**Files:**
- Create: `supabase/migrations/<version>_record_role_ec_domain.sql`

**Interfaces:**
- Produce: una migración de datos **idempotente** que (a) pone en `role.ec` las claves
  no sociales de `public.app_config` que todavía digan `role.app`; (b) barre los
  enlaces `https://role.app` de `public.email_templates` y `public.email_components`;
  (c) **termina affermando** que ninguna clave no social dice `role.app` (con la
  exención de `social.%`, y la de `links.admin_url` sólo si su valor no fuera
  `role.ec`); (d) deja por escrito, en los comentarios, qué valores ya tenía
  producción antes de esta migración (porque en producción esta migración **no
  cambia nada**: es el registro de lo que ya se hizo).

**Contexto medido (2026-10-21, en la base viva):**

| clave | valor en producción | ¿alguna fila del ledger lo escribe? |
| --- | --- | --- |
| `support.email` | `soporte@role.ec` | **no** |
| `contact.hola_email` | `hola@role.ec` | **no** |
| `contact.negocios_email` | `negocios@role.ec` | no (aparece en plantillas) |
| `legal.contact_email` | `legal@role.ec` | **no** |
| `privacy.contact_email` | `privacidad@role.ec` | sí (`20260927053728`) |
| `email.from` | `notificaciones@role.ec` | sí (`20260830014803`) |
| `links.admin_url` | `https://admin.role.ec` | sí (`20260927141336`) |
| `store.default` / `store.ios_url` / `store.play_url` | `https://app.role.ec` | — |
| `social.*` | `…/role.app` | sí (y **no se tocan**) |

- [x] **Step 1: La migración**

Escriba el archivo. Modele la forma sobre `20260927053728_normalize_role_domain.sql`
(la original, sellada): transacción, `update` idempotente con la condición del valor
viejo, `on conflict do nothing` donde siembre, y un bloque `do $verify$` que cierre
la puerta. **La diferencia con la original**: la original normalizaba **una** clave y
eximía `links.admin_url` porque su dominio era la pregunta abierta; esta normaliza
**todas** las claves no sociales que digan `role.app` y **no exonera nada** salvo
`social.%`, porque el dominio del admin ya está confirmado en `role.ec`
(`20260927141336`).

Cuidado con `email.from`: es el remitente del correo y en producción vale
`notificaciones@role.ec`; no se toca salvo que diga `role.app`.

- [x] **Step 2: Aplicar y verificar**

`apply_migration` con el nombre del archivo; después renombrar al versionado del
servidor y `md5sum` contra el ledger. Verificación `SELECT`-only: ninguna clave no
social dice `role.app`; las sociales siguen diciendo `role.app`; y —comparado antes
y después— **los valores de `app_config` no cambiaron** (ya estaban en `role.ec`),
mientras que las tres superficies que seguían con el dominio viejo sí: el
`mailto:` del pie de correo, los tres `slides.redirect_url` inactivos y el literal
de reserva del enlace al panel dentro del trigger.

- [x] **Step 3: Actualizar el arnés de tests**

`apps/api/test/supabase-platform.ts` **marca** `20260927053728` y `20260927141336`
como no replicables: son migraciones que en el replay fallan porque el seed dice
`role.app`. Con la migración nueva, el **final** del replay queda en `role.ec`, pero
esas dos siguen fallando en su punto (sus propias aserciones, antes de la
reparación). Si el conjunto de fallos del replay cambia, actualiza el conjunto fijado
y explica por qué en el propio archivo.

- [x] **Step 4: Correr y verificar**

`cd apps/api && bun test src/database` y `bun run test`: el arnés debe seguir verde.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations apps/api/test
git commit -m "feat(db): el dominio del producto queda registrado en el ledger"
```

---

### Task 2: El código dice `role.ec`

**Files:**
- Modify: `apps/landing/src/lib/site-url.ts`, `src/lib/seo.ts`, `src/lib/seo-files.ts`,
  `src/lib/env.ts`, `vite.config.ts`, `playwright.config.ts`, `.env.example`,
  `README.md`, `src/routes/for-business.tsx`, `src/routes/help-center.tsx`,
  `src/components/footer.tsx`
- Modify: `apps/landing/src/lib/__tests__/site-url.test.ts`,
  `src/lib/__tests__/seo-files.test.ts`, `src/lib/__tests__/seo.test.ts`,
  `src/lib/__tests__/env.test.ts`, `apps/landing/e2e/seo.spec.ts` (sólo la prosa),
  `apps/landing/e2e/fixtures.ts` (sólo la prosa)
- Modify: `apps/mobile/src/core/i18n/strings.ts` (los tres correos) y el test que los
  fije, si hay uno
- Modify: `apps/admin/src/features/app-config/forms/app-config.form.tsx`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produce: `FALLBACK_SITE_URL = "https://role.ec"`; los correos de fallback
  `soporte@role.ec`, `legal@role.ec`, `privacidad@role.ec`, `hola@role.ec`,
  `negocios@role.ec`; y los tests que fijan el canonical/og:url esperando
  `https://role.ec/`.

- [x] **Step 1: Los tests primero**

`apps/landing/src/lib/__tests__/seo.test.ts` espera `https://role.app/` y
`https://role.app/icon.svg`; `site-url.test.ts` y `seo-files.test.ts` tienen el mismo
dominio en sus expectativas. **Cambia esas expectativas a `role.ec` y corre los
tests: tienen que fallar** (el código todavía dice `role.app`). Con eso se prueba
que el test afirma algo.

- [x] **Step 2: El código**

Sustituye `role.app` por `role.ec` en todo lo listado, **incluida la prosa** que lo
explica (los comentarios que cuentan por qué existe el fallback, y los que cuentan
por qué el dominio se movió). La prosa que queda en `role.app` es la que explica el
pasado («antes el fallback era…»), y ésa **se escribe en pasado**: el dominio viejo
se nombra, pero como lo que fue.

- [x] **Step 3: El e2e de la landing**

`apps/landing/e2e/seo.spec.ts:185,198` afirma que el HTML y el sitemap **no**
contienen `https://role.app`. Eso **se queda**: es la guarda de que el dominio viejo
no se cuela. Comprueba que sigue verde.

- [x] **Step 4: Los correos del móvil y el placeholder del admin**

`apps/mobile/src/core/i18n/strings.ts`: `supportEmail`, `contactEmail` (legal) y
`contactEmail` (privacidad). Si hay un test que los fije, se actualiza.
`apps/admin/src/features/app-config/forms/app-config.form.tsx:487`: el placeholder.

- [x] **Step 5: Correr y verificar**

`cd apps/landing && bun test --isolate src`, `cd apps/mobile && bun test --isolate src`,
`cd apps/admin && bun test --isolate src`, `bun run typecheck` en la raíz. Y el e2e de
la landing si el entorno lo permite.

- [x] **Step 6: Commit**

```bash
git commit -m "fix(dominio): el sitio, los correos y los tests dicen role.ec"
```

---

### Task 3: La deuda del §8 y el papel que quedó sin cerrar

**Files:**
- Modify: `docs/security-debt.md` (§8: cerrar con la evidencia; §7: la parte del
  dominio)
- Modify: `docs/superpowers/plans/2026-10-13-business-staff-access-foundation.md` y
  `2026-10-16-business-staff-access-api.md` (marcar las casillas con la evidencia que
  ya llevan dentro)
- Modify: `docs/superpowers/plans/2026-10-21-generalized-subscriptions.md` y
  `2026-10-21-business-staff-ui.md` (anotar el cambio de dominio en el Cierre, sin
  reescribir la evidencia histórica)

**Interfaces:**
- Produce: §8 de `docs/security-debt.md` cerrado con la versión de la migración, su
  `md5sum` y la medición; y los Planes 1 y 2 con sus casillas marcadas.

- [x] **Step 1: Auditar los cuatro planes antiguos**

`2026-09-30-reportes-de-errores`, `2026-10-01-app-config-operador`,
`2026-10-01-e2e-agent-web` y `2026-10-03-anuncios`: ninguno tiene una casilla
marcada. **Determina con el código y con git si se ejecutaron** (¿está su trabajo en
el repo? ¿hay commits que los implementen?) y escribe el veredicto en su propio
documento. Si un plan se ejecutó, márcalo con esa evidencia; si no, di que no se
ejecutó y por qué se queda así.

- [x] **Step 2: Marcar los Planes 1 y 2**

Ambos se ejecutaron: el Plan 1 escribió el ADR-0013 y anotó en el spec §6.1 la
desviación del trigger; el Plan 2 tiene su tabla de cierre con la línea base
medida. Marca sus casillas **con esa evidencia** (no con una afirmación nueva).

- [x] **Step 3: Cerrar el §8 de `docs/security-debt.md`**

Con la versión de la migración, su `md5sum`, la medición antes/después y la lista de
lo que queda abierto (el teléfono del §7, y las acciones de infraestructura).

- [x] **Step 4: Commit**

```bash
git commit -m "docs(plans): el papel que faltaba, con la evidencia que ya tenía"
```

---

## Cierre

- [x] `bun run typecheck && bun run test && bun run build` en la raíz, verdes.
- [x] `bunx turbo run test --force --continue` (el caché de turbo no incluye las env de las apps).
- [x] En la base viva: ninguna clave no social de `app_config` dice `role.app`; las
      sociales **siguen** diciéndolo; los valores de producción no cambiaron.
- [x] El ledger registra el dominio: `md5sum` del archivo == `md5(statements[1])`.
- [x] El repo no dice `role.app` donde dice un default que el producto muestra, y sí
      lo dice donde la razón está escrita (social, fixtures, historial).
- [x] Las acciones de infraestructura que quedan fuera del repo, listadas para el partner.
- [x] Plan cerrado en este documento (casillas marcadas con su evidencia).

### El estado de cada criterio, medido el 2026-10-22

| criterio | veredicto |
| --- | --- |
| `typecheck` verde | **SÍ** — 6/6 |
| `build` verde | **SÍ** — 4/4 |
| `test` verde | **SÍ** — 5/5 con el caché de turbo apagado: API 3024/0, admin 683/0, móvil 1009/0, landing 180/0, commons 417/0 |
| la base viva, en `role.ec` | **SÍ** — ninguna clave no social de `app_config` dice `role.app`; las cuatro sociales **siguen** diciéndolo, y por qué |
| el ledger registra el dominio | **SÍ** — `20261022023427_record_role_ec_domain.sql`, `md5sum` `b8f50abf39ad858ffa05141ad025b8b7` == `md5(statements[1])` del ledger, byte a byte, con el `\1` de la captura **intacto** (sondeado antes de aplicar) |
| lo que cambió en producción | **SÍ, y es lo que se quería**: el `mailto:hola@role.app` del pie de correo, los tres `slides.redirect_url` inactivos y el literal `'https://admin.role.app'` del trigger. Los valores de `app_config` **no** cambiaron: ya estaban en `role.ec` |
| el repo dice `role.ec` donde debe | **SÍ** — el sitio (canonical, og:url, sitemap, JSON-LD), los correos de la landing, del móvil y del panel, y el remitente del ejemplo de la API. Quedan en `role.app`: **las cuentas sociales** (dominio ajeno), **las 170 apariciones de las migraciones selladas** (registro histórico), **los fixtures sin valor de dominio** y **la guarda del e2e** de la landing, que afirma que el sitio **no** anuncia el dominio viejo |
| las acciones de infraestructura | **FUERA del repo, para el partner**: el `VITE_SITE_URL` (o `VERCEL_PROJECT_PRODUCTION_URL`) del despliegue de la landing, el DNS de `role.ec`, las URLs de redirección y los orígenes permitidos del proyecto de Supabase, y el `CORS_ORIGINS` del API si lista el dominio del sitio |
| el teléfono de soporte | **ABIERTO AL CERRAR EL PLAN** (`docs/security-debt.md` §7) — era una decisión de negocio y no se inventa un número |

> (2026-10-23) La fila del teléfono quedó obsoleta ese mismo día: el operador
> decidió el número (`+593 98 897 3278`) y la migración
> `20261023171300_record_support_phone.sql` lo registra; el fallback del móvil y
> el placeholder del panel pasan al mismo valor en el mismo commit. Se anota, no
> se reescribe: el detalle en `docs/security-debt.md` §7.

### El commit

- **Rama `feat/dominio-role-ec`**, nueve commits desde `65890c8`: la migración (con sus
  tres rondas de arreglo) y su renombrado al versionado del servidor, el código de
  la landing, del móvil, del panel y de la API, y el papel que faltaba.

### Lo que este plan dejó escrito y no ejecutado

- **El plan `2026-10-01-app-config-operador` quedó PARCIAL** (auditado en su Task 3): sus
  Tasks 1 y 2 están mergeadas, pero su Task 3 se commiteó en `feat/bug-reports`, **una
  rama que nunca se mergeó**. Por eso `apps/mobile/eas.json` no existe y el placeholder
  del teléfono en el panel del admin sigue en `+52 55 0000 0000`. Está escrito en el
  propio plan, con la evidencia; ejecutarlo es trabajo futuro, no parte de este plan.
