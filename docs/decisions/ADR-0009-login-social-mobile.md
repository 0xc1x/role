# ADR-0009: Login social (Google/Apple) en la app móvil con SDKs nativos

- **Estado**: Aceptado — implementación diferida
- **Fecha**: 2026-09-02

## Contexto

La pantalla de login/signup de mobile muestra botones de Google y Apple como placeholders deshabilitados (`apps/mobile/src/features/auth/presentation/SocialAuthButtons.tsx`, portados de Fudi), documentados como diferido en `docs/improvements/08-codigo-muerto.md` ("social requiere credenciales de proveedor"). Hoy el auth del móvil es solo email/password contra Supabase directo (ADR-0002): `authRepository` en `apps/mobile/src/features/auth/data/repository.ts`, sesión persistida en AsyncStorage y `watchAuthState()` sincronizando `useAuthStore` vía `onAuthStateChange`.

Para hacerlos funcionales se evaluaron dos enfoques:

1. **SDKs nativos + `signInWithIdToken`**: `@react-native-google-signin/google-signin` (Google) y `expo-apple-authentication` (Apple) autentican en Supabase con el idToken del proveedor.
2. **Navegador + PKCE**: `expo-web-browser`/`expo-auth-session` con `signInWithOAuth` y redirect a `role://auth/callback`.

Se elige el enfoque nativo: selector nativo de cuentas (mejor UX), es el camino recomendado por Supabase para Expo, evita deep links, redirect allowlists y el parámetro `flowType`, y el flujo web de Apple arriesga rechazo en revisión de App Store (Apple espera login nativo). El coste es gestionar credenciales en Google Cloud Console y Apple Developer, algo inevitable en ambos enfoques para Apple.

La implementación **se difiere**: esta decisión fija el enfoque y deja el plan ejecutable para cuando se aborde.

## Decisión

**Login social nativo autenticando contra Supabase Auth con `signInWithIdToken`** (no `signInWithOAuth`):

- **Google**: `GoogleSignin.signIn()` → idToken → `supabase.auth.signInWithIdToken({ provider: 'google', token })` → `GoogleSignin.signOut()`.
- **Apple**: solo iOS. Nonce crudo + hash SHA-256 (`expo-crypto`) → `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hash })` → `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce: crudo })`. Cancelación (`ERR_REQUEST_CANCELED`) se trata como no-op silencioso.
- **Visibilidad**: botón Apple oculto en Android; ambos ocultos en el export web (los SDKs nativos no existen ahí).
- **Sin cambios en el cliente supabase-js** ni deep links nuevos: la sesión sigue cayendo en AsyncStorage y `watchAuthState()` ya sincroniza el store.
- **Perfil**: el trigger `handle_new_user` de Supabase crea la fila `profiles` también para usuarios sociales. Apple solo entrega `fullName` en el primer login y no viaja en el idToken: si llega, actualizar `profiles.full_name` además del metadata. Google sí envía `name`/`picture` en el token.
- **Anti-carrera**: replicar el patrón de `handleLogin` (`setProfile` antes de navegar por rol), extrayendo la lógica rol→ruta a un helper compartido.

### Plan de implementación diferido

**Prerequisitos externos** (sin ellos los botones quedan cableados pero sin funcionar):

1. **Google Cloud Console** para `com.xcix.role`: OAuth client **Web** (va en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; Supabase valida el `aud`), client **iOS** (bundle → REVERSED_CLIENT_ID como `iosUrlScheme` en `app.json`) y client **Android** (package + SHA-1 del keystore debug y del de EAS, vía `eas credentials` o `keytool -list`).
2. **Apple Developer**: habilitar capability "Sign in with Apple" en el App ID `com.xcix.role` (crear Services ID / key .p8 solo si el dashboard de Supabase la exige para activar el proveedor).
3. **Supabase Dashboard → Auth → Providers**: Google ON con los 3 client IDs como "Authorized Client IDs"; Apple ON.

**Cambios de código** (`apps/mobile`, capas existentes repos → hooks → componentes):

1. `npx expo install @react-native-google-signin/google-signin expo-apple-authentication expo-crypto`.
2. `app.json`: plugins `["@react-native-google-signin/google-signin", { "iosUrlScheme": "..." }]` y `"expo-apple-authentication"`.
3. `src/core/config/env.ts`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` opcionales en zod, con validación amigable en runtime; actualizar `.env.example`.
4. `repository.ts`: `signInWithGoogle()` / `signInWithApple()` con cancelaciones silenciosas y mapeo de errores (proveedor no configurado, Play Services faltantes).
5. Hook `use-social-auth` (loading por proveedor, perfil enriquecido, `setProfile`, navegación por rol) + `SocialAuthButtons` con props `onGooglePress`/`onApplePress`/loading, sin `disabled`; cablear en `login.tsx` y `signup.tsx`; strings de error en i18n.
6. Tests vitest de la lógica pura (ruta por rol, composición del nombre Apple, visibilidad de botones) + guía `apps/mobile/docs/social-auth-setup.md` con el paso a paso de dashboards; quitar la nota "diferido" de `docs/improvements/08-codigo-muerto.md`.

**Verificación**: `bun run typecheck`, `bun run test`, `bun run build`, y **build nativa nueva obligatoria** (`expo run:ios`/`run:android` o `eas build --profile development`): los SDKs son módulos nativos y no funcionan en Expo Go ni con el dev client actual. QA: Google en iOS/Android, Apple solo iOS, cancelación sin error, sesión persistente tras reiniciar la app.

## Consecuencias

- **Requiere credenciales externas antes de ser funcional** (prerequisitos 1–3); son pasos manuales en Google Cloud, Apple Developer y Supabase que no viven en el repo.
- **Nueva build de desarrollo** al añadir los módulos nativos; no hay impacto en producción hasta generar build.
- Los usuarios sociales entran por la misma ruta del trigger `handle_new_user` que el signup por email; al implementar, **verificar en Supabase** que el trigger rellena `full_name`/`avatar_url` desde `raw_user_meta_data` (Google sí los incluye; Apple solo email) y que los defaults (`user_preferences`, `consumer_notification_preferences`, `user_consents`) se crean igual que en signup por email.
- Sin cambios en `packages/commons` ni en la API NestJS (el móvil consume Supabase directo, ADR-0002).
- Revisar esta decisión al implementar: si Supabase cambia las recomendaciones para Expo (p. ej. alrededor de `signInWithIdToken` o flujos PKCE), re-evaluar el enfoque antes de escribir código.
