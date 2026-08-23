# Rolé — Mobile (`apps/mobile`)

Expo SDK 57 + expo-router + TypeScript estricto. App móvil consumer
(ver `docs/improvements/` para el detalle de mejoras aplicadas).

## Stack y decisiones

- **expo-router** (file-based routing), grupos: `(auth)`, `(consumer)`, `(business)`,
  `landing`, `profile`, `business/[id]`.
- **TanStack Query** para estado de servidor; **Zustand** SOLO para sesión
  (`useAuthStore`, alimentado por `watchAuthState` de Supabase).
- **Supabase directo** (ADR-0002): el móvil es consumidor directo con RLS como
  frontera; la API es BFF de admin/landing, no del móvil.
- **`@0xc1x/role-commons`** (workspace:*) es el SSOT de contratos. El móvil NO
  redefine entidades: solo proyecciones PostgREST (`Pick<>`) y view models
  móvil-específicos (`OfferDetail`, `OrderDetail`, `BusinessProfileDetail`,
  `FavoriteOffer`, `PaymentMethodModel` — este último device-local por diseño).
- **Env con Zod** (`src/core/config/env.ts`): `EXPO_PUBLIC_*` validados al arranque.
- **i18n tipado** (`src/core/i18n/strings.ts`): catálogo es-ES; nada de literales
  inline en pantallas.
- **Errores**: taxonomía `AppError` + `toAppError` (PostgrestError → categoría).
- **UI kit** (`src/core/ui`): AppText, Button, Card, Screen, TextField, StatusBadge,
  EmptyState, ErrorState — tokens del theme, cero hex inline.

## Estructura

```
app/                      # rutas expo-router (UI)
src/
├── core/                 # infra: config (env), error, i18n, query, supabase,
│                         #   theme (tokens), ui (kit), utils (formatters)
└── features/
    ├── auth/             # user, store (Zustand), data/repository
    ├── offers/           # domain (helpers puros), data/repository
    ├── orders/           # domain (transiciones, cupones), data/repository
    ├── favorites/        # data/repository
    ├── profile/          # domain, data/repository, hooks
    ├── business/         # domain, data/repository, hooks, data/notifications
    ├── hooks/            # facade de hooks compartidos
    └── notifications/    # push token + local notifications
```

Regla de capas: componentes → hooks (`use*`) → repos (`data/`) → Supabase. El
componente no conoce repos ni queries.

## Comandos

```sh
export PATH="$HOME/.bun/bin:$PATH"
bun run start             # expo start
bun run typecheck         # tsc --noEmit (requiere build de commons)
bun run test              # vitest (dominio puro)
```

Requiere `.env` local (ver `.env.example`).

## Reglas

- No hardcodees strings/secrets/colores: i18n + env + tokens.
- No dupliques tipos que existen en commons.
- RPCs para transacciones (`reserve_offer`, `cancel_order`, `validate_pickup_code`).
- El producto se llama **Rolé** (acento en la e).
- `bunx tsc --noEmit` es el gate autoritativo (los errores de LSP pueden ser stale).
