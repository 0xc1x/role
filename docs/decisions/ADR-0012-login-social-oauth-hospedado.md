# ADR-0012: Login social (Google/Apple) con flujo OAuth hospedado

- Estado: aceptado — **reemplaza a ADR-0009** (SDKs nativos + `signInWithIdToken`).
- Fecha: 2026-09-30

## Contexto

ADR-0009 decidió autenticación social con SDKs nativos por proveedor. Esa
decisión cubre solo iOS/Android y deja fuera la PWA web, que es una superficie
de primer nivel del producto (`expo export` → Vercel). Mantenerla implicaba dos
implementaciones (SDKs en nativo + OAuth en web) para el mismo login.

## Decisión

Un solo flujo OAuth hospedado por Supabase (Flow A) para PWA + iOS + Android:

- La app abre la URL de `signInWithOAuth` y vuelve con `?code=`.
- Nativo: sheet incrustado (`expo-web-browser`) + deep link `role://callback`
  + `exchangeCodeForSession`. Sin `skipBrowserRedirect` (no existe en los tipos
  de auth-js instalados y en nativo es innecesario: sin `window` no hay
  redirect automático).
- Web: redirect de página completa; `detectSessionInUrl` completa la sesión.
- Cancelar el sheet es no-op silencioso (misma postura que
  `ERR_REQUEST_CANCELED` de Apple en ADR-0009).
- Implementación en `feat/social-auth-oauth`:
  `src/features/auth/data/social-auth.ts` (helpers puros),
  `authRepository.signInWithProvider`, `SocialAuthButtons` reactivado,
  ruta `app/(auth)/callback.tsx` (sirve `/callback`: los grupos se omiten).

## Consecuencias

- Se acabó probar auth en Expo Go para este flujo (requiere dev client); el
  resto de la app no cambia.
- App Store sigue exigiendo Sign in with Apple si existe el botón Google:
  ambos providers se configuran y despliegan juntos (dashboards, ver
  `social-auth-oauth-plan.md` §4).
- ADR-0009 queda histórico: su análisis de providers/trigger (`handle_new_user`
  crea la fila `profiles` también para usuarios sociales) sigue válido y se
  reutilizó; solo cambia el mecanismo de obtención del token.
