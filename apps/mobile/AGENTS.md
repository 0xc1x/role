# Rolé — Mobile (`apps/mobile`)

Expo SDK 57 + expo-router + TypeScript estricto. App móvil consumer + PWA
web (deploy Vercel vía `expo export`). App móvil consumer
(ver `docs/improvements/` para el detalle de mejoras aplicadas).

## Stack y decisiones

- **expo-router** (file-based routing), grupos: `(auth)`, `(consumer)` (tabs home/
  explore + `profile/*`), `(business)` (tabs del negocio), `business/[id]/**`
  (panel), `checkout/`, `order/`, `offer/`, `landing/`, `my-business/`.
- **TanStack Query** para estado de servidor; **Zustand** SOLO para sesión
  (`useAuthStore`, alimentado por `watchAuthState` de Supabase) y estado de
  UI del tab bar (`tabbar-store`).
- **Supabase directo** (ADR-0002): el móvil es consumidor directo con RLS como
  frontera; la API es BFF de admin/landing, no del móvil.
- **`@0xc1x/role-commons`** (workspace:*) es el SSOT de contratos. El móvil NO
  redefine entidades: solo proyecciones PostgREST (`Pick<>`) y view models
  móvil-específicos (`OfferDetail`, `OrderDetail`, `BusinessProfileDetail`,
  `FavoriteOffer`, `PaymentMethodModel` — este último device-local por diseño).
- **Env con Zod** (`src/core/config/env.ts`): `EXPO_PUBLIC_*` validados al
  arranque; leerlos SIEMPRE vía `env.*`, nunca `process.env` directo.
- **i18n tipado** (`src/core/i18n/strings.ts`): catálogo es-ES; nada de literales
  inline en pantallas.
- **Errores**: taxonomía `AppError` + `toAppError` (PostgrestError → categoría).
- **Mutaciones**: `useMutation` (invalidaciones + Sentry del `MutationCache`).
  Excepción consciente: login/signup/update-password son operaciones de sesión
  (store de auth), sin caché que invalidar.
- **UI kit** (`src/core/ui`): AppText, Button, Card, Screen, TextField (con
  `iconName`/`secureToggle`), StatusBadge, EmptyState, ErrorState, RoleTabBar,
  BottomSheetModal, WebPullToRefresh — tokens del theme, cero hex inline.

## Dos kits de UI (convención)

- `src/core/ui` — kit propio del producto (PascalCase, barrel `index.tsx`).
  Cualquier componente nuevo de producto va aquí.
- `src/components/ui` — port shadcn/rn-primitives (kebab-case, sin barrel).
  No lo edites para lógica de producto; sirve de infraestructura (Drawer,
  AlertDialog, Select, Switch, Avatar, Skeleton...). Tras el prune de 2026-09
  solo quedan los componentes con consumo real.

## Estructura

```
app/                      # rutas expo-router (UI)
src/
├── core/                 # infra: config (env), error, i18n, query, supabase,
│                         #   theme (tokens + alpha), ui (kit), utils (formatters)
└── features/
    ├── auth/             # domain, store (Zustand), data/repository, presentation
    ├── offers/           # domain, data/repository, components
    ├── orders/           # domain, data/repository, components (checkout, pickup-qr)
    ├── favorites/        # data/repository
    ├── profile/          # domain, data/repository, hooks, components
    ├── business/         # domain, data/repository, hooks, components
    ├── config/           # data/repository, hooks
    ├── explore/          # components (mapa nativo/web), exploreTypes
    ├── home/             # components
    ├── hooks/            # facade de hooks compartidos consumer
    ├── slides/ tips/     # domain, data/repository, hooks
    └── notifications/    # data/repository, use-push-toggle, web-push (web)
```

Regla de capas: componentes → hooks (`use*`) → repos (`data/`) → Supabase. El
componente no conoce repos ni queries; todo `.from()`/`.rpc()` vive en `data/`.

## Comandos

```sh
export PATH="$HOME/.bun/bin:$PATH"
bun run start             # expo start
bun run typecheck         # tsc --noEmit (requiere build de commons)
bun test --isolate src    # bun:test: dominio, repos (mock de supabase) y utils
```

Requiere `.env` local (ver `.env.example`).

## Reglas

- No hardcodees strings/secrets/colores: i18n + env + tokens. Los translúcidos
  van con `withAlpha(token, alpha)` (`src/core/theme/alpha.ts`); el hex crudo
  solo existe en `colors.ts` (excepciones intencionales: `Logo.tsx` monocromo,
  port shadcn). Tokens semánticos para casos especiales: `scrim`, `onMedia`,
  `ink`, `qrForeground/qrBackground`.
- Tipografía: usa `variant` de `AppText` (escala en `theme/typography.ts`).
  Si falta un estilo, añádelo allí; no pongas `fontSize` inline salvo display
  one-off con comentario (ej. pickup code).
- No dupliques tipos que existen en commons.
- RPCs para transacciones (`reserve_offer`, `cancel_order`,
  `validate_pickup_code`, `set_order_status` — matriz de estados server-side).
- Features ocultas por la pasarela de pagos se COMENTAN con nota, no se borran
  (menú de perfil, payouts, FAQs de pagos).
- El producto se llama **Rolé** (acento en la e).
- `bunx tsc --noEmit` es el gate autoritativo (los errores de LSP pueden ser stale).
