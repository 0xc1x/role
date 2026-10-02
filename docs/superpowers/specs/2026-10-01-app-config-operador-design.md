# Design: centralizar identidad del operador en `app_config`

Fecha: 2026-10-01
Enfoque aprobado: A con pendientes (aditivo, sin DROP en este ciclo)
Alcance autorizado: todo en código + migraciones vía MCP Supabase + subagentes. DROP fase 3 fuera de este ciclo.

## 1. Problema

- Landing lee `legal.controller_identity` (`apps/landing/src/routes/terms.tsx:28-29`, `privacy.tsx:27-28`) pero la key **no existe** en el seed (`supabase/migrations/20260821205638_create_app_config.sql:39-90`). Cae al fallback "pendiente de publicación".
- Mobile hardcodea razón social/RUC/emails en `apps/mobile/src/core/i18n/strings.ts:1537-1538,1755,1795,1806,1841,1856`. `help.tsx:343-350` ya usa `useConfigValue` con fallback a esos strings; `terms.tsx`/`privacy.tsx` no.
- `support.phone` seed es `+52 55 1234 5678` (MX), debe pasar a placeholder EC editable.
- Docs desactualizados: `docs/security-debt.md` (nombre fase 3, conteo S2, S4 cerrado, S3 parcial, admin email/tel), copy con restos de pasarela automática (`strings.ts:1277,1282,1292`), sin `apps/mobile/eas.json`.

## 2. Arquitectura

- `app_config` es SSOT de valores operables (contacto, legal, marketing). Lectura: mobile directo Supabase (`fetchAppConfig` en `apps/mobile/src/features/config/data/repository.ts:10-24`, RLS `active AND is_public`); landing/admin vía API BFF + `useConfig` (`apps/landing/src/lib/use-config.ts:7-10`).
- Nuevas keys categoría `legal` (todas `is_public=true`, `active=true`):
  - `legal.controller_identity` (string): `"el operador de Rolé (identidad legal pendiente de publicación)"`
  - `legal.company_name` (string): `"Operador de Rolé (pendiente)"`
  - `legal.ruc` (string): `""` (vacío = no publicado)
  - `legal.address` (string): `"Quito, Ecuador (pendiente de confirmación)"`
  - `legal.jurisdiction` (string): `"tribunales de Quito, Ecuador"`
  - `legal.terms_updated_at` ya existe; no duplicar.
  - Update (no insert): `support.phone` → `"+593 99 000 0000"`, descripción "placeholder EC editable desde admin".
- Migración **aditiva** vía `apply_migration` (regla repo). Nada destructivo. Tras aplicar: renombrar archivo a versión servidor y verificar `md5sum == md5(statements[1])` del ledger.

## 3. Componentes y cambios

1. **DB (migración):** `insert ... on conflict (key) do nothing` para las 5 keys + `update support.phone`. RLS sin cambios (hereda políticas de `20260821205638`).
2. **Mobile:**
   - `app/(consumer)/profile/terms.tsx`, `privacy.tsx`: leer `legal.controller_identity`, `legal.ruc`, `legal.company_name`, `legal/legal.contact_email`, `privacy.contact_email` vía `useConfigValue` con fallback a `strings.*`; interpolar en secciones (reemplazo de `0xC1X S.A.S., RUC 1799999999001` y emails hardcodeados).
   - `src/core/i18n/strings.ts`: mantener fallbacks, cambiar `supportPhone` a `"+593 99 000 0000"`; comentar `1277,1282,1292` (pasarela automática) con nota "hasta habilitar pasarela" como en `1183-1188`; no borrar.
   - Tests: `strings.test.ts` (placeholders), `release-config.test.ts` si toca bundle, repo config mock ya existente.
3. **Landing:** sin cambios de rutas; solo verifica que `terms.tsx`/`privacy.tsx`/`help-center.tsx`/`for-business.tsx`/`footer.tsx` ya leen keys existentes. Si se agrega `legal.ruc/address` al copy, usar `useConfig` con mismo fallback.
4. **Admin:** `app-config.form.tsx:487,491` placeholders a `soporte@role.app` / `+593 99 000 0000`; las nuevas keys aparecen solas (grid por categoría `legal`).
5. **Docs:** `docs/security-debt.md` (fase 3 → `20260927025753_*`, S2 11/12, S4 cerrado, S3 parcial + admin tiene email/tel), `supabase/migrations/README.md` conteo si aplica.
6. **EAS:** crear `apps/mobile/eas.json` (`development`/`preview`/`production`, `EXPO_PUBLIC_ENVIRONMENT` por perfil, sin secrets en repo).

## 4. Flujo de datos y errores

- Config se precarga en splash (`app/_layout.tsx:160` `prefetchQuery(appConfigQueryOptions)`); `useConfigValue` nunca bloquea: si query falla/pendiente devuelve fallback. Sin cambios.
- Legal en mobile: si `legal.ruc == ""`, no renderizar "RUC ..." (evita publicar vacío). Misma guarda para `company_name` pendiente.
- Sin `SECURITY DEFINER`, sin grants nuevos a `anon` (solo filas `is_public`), sin service_role en cliente.

## 5. Testing y verificación

- `supabase db advisors` (o MCP `get_advisors`) tras la migración; revisar checklist seguridad Supabase (RLS, vistas, funciones).
- `bun run typecheck --filter=mobile...` luego completo si hay tiempo; `bun run test` (mobile `bun test --isolate src`, landing `legal-copy.test.ts`, `use-config.test.tsx`); `bun run build` según turbo.
- Verificación funcional: landing `/terms` y `/privacy` sin placeholders crudos `{...}`; mobile help/terms/privacy con valores de `app_config` (cambiar un valor en admin/staging y revalidar); `legal-copy.test.ts` sigue pasando (sin RUC real en copy).
- DROP `20260927025753_businesses_drop_sensitive_columns.sql` **no se aplica**: queda como paso posterior con gate `API fase2 desplegada (health version==SHA con código fase2) → verificar → aplicar`.

## 6. Fuera de alcance explícito

- Deploy Render/Vercel, secrets prod, Sentry DSN prod, Maps key restringida, cuentas store, smoke E2E en dispositivo, verificación de entrega Resend end-to-end (solo se deja el código existente, se documenta como pendiente de prueba en staging).
- PRs pequeños: 1) migración + admin placeholders, 2) mobile lectura legal, 3) docs/copy/eas.json. No un solo PR gigante.
