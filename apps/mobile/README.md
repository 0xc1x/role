# role-mobile

Expo — port del app Flutter **fudi** (consumer + business surfaces). Estrategia strangler: el app Flutter sigue en producción hasta paridad por features.

## Gotchas (bun + Expo, según docs oficiales)

- Scaffold: `bun create expo-app apps/mobile` — **requiere Node.js LTS** (usa `npm pack` por debajo).
- EAS detecta el package manager por lockfile: mantener el **único** `bun.lock` del monorepo (no regenerar `package-lock.json`).
- `trustedDependencies` en `package.json` del app: agregar `"@sentry/cli"` (postinstall para source maps en EAS Build con Sentry).
- `bun expo install <paquete>` para librerías Expo.

## Configuración crítica

- **Bundle ID / applicationId: `com.xcix.role`** (en `app.json`: `android.package` / `ios.bundleIdentifier`). Renombrar `xcix → empresa` ANTES del primer release a stores (se congela con la primera subida).
- Supabase directo desde el cliente (mismas queries/RLS que el app Flutter) — sin capa API intermedia.
- Stack destino: expo-router + TanStack Query + Zustand + zod (schemas de role-commons) + expo-notifications + expo-camera (scanner) + react-native-maps + @sentry/react-native + expo-secure-store.
