# app_config operador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar identidad del operador (razón social, RUC, dirección, emails, teléfono EC) en `app_config` con placeholders editables desde admin.

**Architecture:** Migración solo-aditiva vía `apply_migration`; mobile/landing leen con `useConfigValue`/`useConfig` y fallback (nunca bloquean); docs + copy + `eas.json` sin tocar prod destructivo.

**Tech Stack:** Supabase Postgres + RLS, Expo React Native + TanStack Query, TanStack Start landing/admin, Biome, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-01-app-config-operador-design.md`

## Global Constraints

- Toda migración entra por `apply_migration`, nunca por `execute_sql` ni dashboard; tras aplicar renombrar archivo a versión del servidor y confirmar `md5sum == md5(statements[1])` del ledger (`supabase/migrations/README.md`).
- Mobile lee Supabase directo con RLS como frontera; la API es BFF de admin/landing, no del móvil (ADR-0002).
- Mobile: nada de literales inline en pantallas (i18n en `strings.ts`); features ocultas por pasarela se COMENTAN con nota, no se borran (`apps/mobile/AGENTS.md`).
- No commitear secrets/env reales; DSN/Maps van por EAS secrets, no en repo.
- Nunca declarar done si `bun run typecheck`, `bun run test` o `bun run build` fallan.
- PRs pequeños: 1) migración, 2) mobile, 3) docs/copy/eas+admin.
- DROP `20260927025753_businesses_drop_sensitive_columns.sql` fuera de este plan (gate posterior: API fase2 desplegada → verificar → aplicar).

## Review Focus

- `legal.ruc == ""` debe ocultar "RUC ..." en vez de renderizar "RUC " vacío.
- Sin red o con `app_config` inaccesible, legal/help renderizan fallback y no pantalla en blanco.
- Ningún `{controllerIdentity}`/`{contactEmail}` crudo llega al HTML/servido en landing ni al texto mobile.
- Una key con `is_public=false` no debe romper mobile (fallback la cubre).
- `tel:+593...` abre marcador; `mailto:` con emails de config no rompe con caracteres especiales.

---

### Task 1: Migración aditiva `app_config` identidad del operador

**Files:**
- Create (temporal): `supabase/migrations/20261001000000_app_config_operator_identity.sql` (renombrar a versión servidor tras `apply_migration`)
- Verify: ledger `supabase_migrations.schema_migrations` vía MCP

**Interfaces:**
- Consumes: tabla `public.app_config(key, value, value_type, category, label, description, is_public, active)` + RLS existente (`20260821205638_create_app_config.sql:3-33`)
- Produces: keys `legal.controller_identity`, `legal.company_name`, `legal.ruc`, `legal.address`, `legal.jurisdiction` + `support.phone` actualizado, legibles por `anon` (`active AND is_public`)

- [ ] **Step 1: Crear el archivo de migración con el SQL exacto**

En `supabase/migrations/20261001000000_app_config_operator_identity.sql`:

```sql
insert into public.app_config (key, value, value_type, category, label, description, is_public, active) values
  ('legal.controller_identity', '"el operador de Rolé (identidad legal pendiente de publicación)"', 'string', 'legal', 'Identidad del responsable', 'Sustituye {controllerIdentity} en términos y privacidad', true, true),
  ('legal.company_name', '"Operador de Rolé (pendiente)"', 'string', 'legal', 'Razón social', 'Nombre legal del operador, editable cuando se defina', true, true),
  ('legal.ruc', '""', 'string', 'legal', 'RUC', 'Vacío = no publicado; mobile lo oculta', true, true),
  ('legal.address', '"Quito, Ecuador (pendiente de confirmación)"', 'string', 'legal', 'Dirección', 'Ciudad/dirección del operador', true, true),
  ('legal.jurisdiction', '"tribunales de Quito, Ecuador"', 'string', 'legal', 'Jurisdicción', 'Jurisdicción aplicable', true, true)
on conflict (key) do nothing;

update public.app_config
set value = '"+593 99 000 0000"',
    description = 'Teléfono mostrado en el centro de ayuda (placeholder EC, editable)'
where key = 'support.phone';
```

- [ ] **Step 2: Aplicar vía `apply_migration` (MCP Supabase)**

Usar herramienta MCP `apply_migration` con `name="app_config_operator_identity"` y el SQL del paso 1. No usar `execute_sql`.

- [ ] **Step 3: Verificar ledger + renombrar + md5**

Consultar ledger (`version`, `md5(statements[1])`), renombrar el archivo a `<version_servidor>_app_config_operator_identity.sql`, correr `md5sum <archivo>` y comparar con `md5(statements[1])`. Luego `select key, value from public.app_config where key like 'legal.%' or key='support.phone' order by key;` y confirmar 5 keys + phone `+593 99 000 0000`.
Expected: md5 idénticos, 6 filas visibles.

- [ ] **Step 4: Advisors de seguridad**

Correr `supabase db advisors` (o MCP `get_advisors`); corregir solo hallazgos nuevos de esta migración (RLS, grants, `SECURITY DEFINER`).
Expected: sin nuevas críticas atribuibles a `app_config`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*app_config_operator_identity.sql
git commit -m "feat(db): add operator identity keys to app_config"
```

### Task 2: Mobile lee identidad legal desde `app_config`

**Files:**
- Modify: `apps/mobile/app/(consumer)/profile/terms.tsx`
- Modify: `apps/mobile/app/(consumer)/profile/privacy.tsx`
- Modify: `apps/mobile/src/core/i18n/strings.ts:1536,1755,1795,1806,1841,1856` (fallbacks + plantillas) y `1270-1313,1507-1508` (comentar pasarela)
- Test: `apps/mobile/src/core/i18n/strings.test.ts`, `bun test --isolate src`, `bun run typecheck`

**Interfaces:**
- Consumes: `useConfigValue(key: string, fallback: string): string` (`apps/mobile/src/features/config/hooks.ts:23`), `LegalScreen({title, updatedAt, sections: readonly {title, content}[]})` (`apps/mobile/src/core/ui/LegalScreen.tsx:14-22`)
- Produces: `TermsScreen`/`PrivacyScreen` con secciones interpoladas; `strings.ts` sin `+52` ni RUC real como valor vivo (solo fallback/plantilla con `{...}`)

- [ ] **Step 1: Test failing de interpolación + guarda de RUC vacío**

En test i18n (o nuevo `apps/mobile/src/core/i18n/operator-identity.test.ts` si el existente no cubre): assert que `termsScreen.sections[0].content` contiene `{controllerIdentity}` (no `1799999999001`), que `supportPhone` fallback es `+593 99 000 0000`, y que un helper/pantalla con `ruc=""` no renderiza `"RUC "`.

```ts
import { getConfigValue } from "@0xc1x/role-commons";

expect(strings.termsScreen.sections[0].content).toContain("{controllerIdentity}");
expect(strings.termsScreen.sections[0].content).not.toContain("1799999999001");
expect(strings.helpCenter.supportPhone).toBe("+593 99 000 0000");
// Fallback nunca bloquea: sin datos de config devuelve el fallback (Review Focus: offline / is_public=false).
expect(getConfigValue(undefined, "legal.ruc", "")).toBe("");
expect(getConfigValue(undefined, "support.phone", "+593 99 000 0000")).toBe("+593 99 000 0000");
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `bun test --isolate src/core/i18n` (workdir `apps/mobile`)
Expected: FAIL (todavía hay RUC hardcodeado y `+52`).

- [ ] **Step 3: Implementar `terms.tsx`/`privacy.tsx` con `useConfigValue`**

Firma exacta en cada pantalla:

```tsx
const controllerIdentity = useConfigValue("legal.controller_identity", "el operador de Rolé (identidad legal pendiente de publicación)");
const companyName = useConfigValue("legal.company_name", "Operador de Rolé (pendiente)");
const ruc = useConfigValue("legal.ruc", "");
const address = useConfigValue("legal.address", "Quito, Ecuador (pendiente de confirmación)");
const legalEmail = useConfigValue("legal.contact_email", strings.termsScreen... );
const privacyEmail = useConfigValue("privacy.contact_email", ...);
```

Construir `sections = strings.termsScreen.sections.map(s => ({...s, content: s.content.replace("{controllerIdentity}", identity).replace("{ruc}", ruc)...}))` donde `identity = ruc ? `${companyName}, RUC ${ruc}, ${address}` : `${companyName}, ${address}``. Si `ruc === ""`, no emitir "RUC ". Pasar a `LegalScreen` sin cambiar sus props.

- [ ] **Step 4: Retocar `strings.ts` (fallbacks + comentar pasarela)**

`s supportPhone` → `"+593 99 000 0000"`; secciones `termsScreen[0]`, `privacyScreen[0]` a plantillas con `{controllerIdentity}`/`{contactEmail}` (sin `0xC1X`/`1799999999001`); `termsScreen[8]`, `privacyScreen[7,10]` emails a `{contactEmail}`; comentar bloques `1270-1313` (Cobros/Pagos/Facturación) y reescribir `helpFaqPaymentsAnswer (1507-1508)` a pickup-only con nota `// Oculta hasta habilitar la pasarela de pagos`.

- [ ] **Step 5: Correr tests + typecheck del paquete**

Run: `bun test --isolate src` y `bun run typecheck` (workdir `apps/mobile`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(consumer\)/profile/terms.tsx apps/mobile/app/\(consumer\)/profile/privacy.tsx apps/mobile/src/core/i18n/strings.ts
git commit -m "feat(mobile): read operator identity from app_config"
```

### Task 3: Docs, admin placeholder, copy pickup-only y `eas.json`

**Files:**
- Modify: `docs/security-debt.md` (fase 3 → `20260927025753_*`, S2 11/12, S4 cerrado, S3 parcial, admin email/tel existe)
- Modify: `apps/admin/src/features/app-config/forms/app-config.form.tsx:491` (`+52 55 0000 0000` → `+593 99 000 0000`)
- Modify: `apps/landing` solo si falta lectura de `legal.ruc/address` (mantener `useConfig(key, fallback)` en `terms.tsx:24-38`, `privacy.tsx:23-37`)
- Create: `apps/mobile/eas.json`
- Test: `apps/landing/src/lib/__tests__/legal-copy.test.ts`, `apps/landing/src/lib/__tests__/use-config.test.tsx`, `bun run typecheck`, `bun run check`

**Interfaces:**
- Consumes: `useConfig(key: string, fallback: string): string` (`apps/landing/src/lib/use-config.ts:7-10`); `TERMS_SECTIONS`/`PRIVACY_SECTIONS` con `{controllerIdentity}`/`{contactEmail}`; `APP_CONFIG_VALUE_TYPES` en admin
- Produces: docs sin conteos/nombres viejos; admin con placeholder EC; `eas.json` con perfiles sin secrets

- [ ] **Step 1: Test failing de copy legal sin RUC real**

Agregar (o confirmar) asserts en `apps/landing/src/lib/__tests__/legal-copy.test.ts`:

```ts
expect(termsCopy).toContain("{controllerIdentity}");
expect(termsCopy).not.toContain("1799999999001");
expect(privacyCopy).not.toContain("+52");
```

- [ ] **Step 2: Correr y ver fallo si docs/copy aún tienen valores viejos**

Run: `bun run test` (workdir `apps/landing`)
Expected: FAIL solo si queda RUC/`+52` en copy activo (los fallbacks pendientes sí pasan).

- [ ] **Step 3: Actualizar `docs/security-debt.md` + admin placeholder**

`security-debt.md`: nombre fase 3 `20260927025753_businesses_drop_sensitive_columns.sql`; S2 "11 de 12 difieren, solo `20260925165931*` idéntico"; S4 "cerrado (lint en mobile/commons)"; S3 "parcial: `sendConfirmationEmail` existe en `businesses.service.ts:202-277`, falta verificar entrega; admin sí muestra email/tel (`businesses.columns.tsx:40,51`)". Admin `app-config.form.tsx:491` → `"+593 99 000 0000"`.

- [ ] **Step 4: Crear `apps/mobile/eas.json` sin secrets**

```json
{
  "build": {
    "development": { "channel": "development", "env": { "EXPO_PUBLIC_ENVIRONMENT": "development" } },
    "preview": { "channel": "preview", "distribution": "internal", "env": { "EXPO_PUBLIC_ENVIRONMENT": "preview" } },
    "production": { "channel": "production", "env": { "EXPO_PUBLIC_ENVIRONMENT": "production" } }
  }
}
```

DSN/Maps/EAS projectId por EAS secrets, nunca en repo.

- [ ] **Step 5: Verificación del paquete + sin secrets en `eas.json`**

Run: `bun run typecheck && bun run check && bun run test` (workdirs `apps/landing`, `apps/admin`; `bun run typecheck --filter=mobile...` si el completo es largo)
Expected: PASS.
Run: `grep -ri "AIza\|SENTRY_DSN\|secret" apps/mobile/eas.json || true` (workdir repo)
Expected: sin matches (Review Focus: ningún secret en repo; `tel:`/`mailto:` se prueban manual en staging).

- [ ] **Step 6: Commit**

```bash
git add docs/security-debt.md apps/admin/src/features/app-config/forms/app-config.form.tsx apps/mobile/eas.json apps/landing/src/lib/legal/
git commit -m "docs: sync security-debt, EC placeholders and eas profiles"
```
