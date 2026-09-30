# Social Auth (Google + Apple) via hosted OAuth — Implementation Plan

> Flow A: one Supabase-hosted OAuth flow serving **PWA (web) + native (iOS/Android)**.
> This plan is written for a fresh agent context. Read the repo guides first:
> `AGENTS.md` (root), `apps/mobile/AGENTS.md`. Conventions: conventional commits,
> no AI attribution, `bun run typecheck` + `bun run test` gates (turbo filters).

## 0. Decision context (read before coding)

- **ADR-0009** (`docs/decisions/ADR-0009-login-social-mobile.md`) previously chose
  native SDKs + `signInWithIdToken` and explicitly rejected `signInWithOAuth`.
  That decision is **native-only and leaves the PWA unsolved**.
- Product chose Flow A instead: one flow for all three surfaces, less config,
  standard embedded-auth UX. **Superseding ADR-0009 is part of this work**
  (task T9): add a short superseding ADR or amendment section. Do not leave two
  contradictory ADRs standing.
- App Store rule (non-negotiable): shipping Google login on iOS **requires**
  Sign in with Apple. Both providers ship together or neither ships.

## 1. Verified facts (do not re-derive, verified against installed deps)

- `apps/mobile` uses `@supabase/supabase-js@2.112.x` → auth-js `2.112.4`.
  - `signInWithOAuth({ provider, options: { redirectTo } })` returns
    `{ data: { provider, url } }`. On native `isBrowser()` is false, so the
    library does **not** auto-redirect — just open `data.url` yourself. On web
    it auto-redirects, which is exactly the desired web behavior.
  - **`skipBrowserRedirect` is NOT in the installed `.d.ts`** (runtime reads
    it, types don't). Do NOT pass it: TS excess-property check will fail the
    build, and it is unnecessary on native anyway.
  - `supabase.auth.exchangeCodeForSession(code)` exists in the installed types.
- `src/core/supabase/client.ts` already sets `detectSessionInUrl: true`, so the
  **web return needs no manual code exchange** — loading the redirect target
  completes the session automatically.
- Deep-link scheme is `role` (`app.json`), bundle id `com.fudi.role`.
  Supabase project ref: `sxqopofoynsqkztozlix`
  (`https://sxqopofoynsqkztozlix.supabase.co`).
- Expo Router: parenthesised groups are stripped from URLs, so
  `app/(auth)/callback.tsx` serves path **`/callback`** (not `/auth/callback`).
  Redirect URLs below must match this.
- Post-login navigation needs no new code: root `watchAuthState()` syncs the
  store and `app/index.tsx` (role-aware gate) routes the user.
- `enrichProfile()` tolerates users with no `profiles` row (returns the
  metadata-based profile; `parseRole(undefined)` → `"user"`). The
  `handle_new_user` trigger creates `profiles` rows for social users too —
  but verify metadata mapping (T8).
- `export:web` / `build:vercel` already run with `--clear` (stale-env poisoning
  fixed). No cache work needed.
- `expo-linking` is installed. `expo-web-browser` / `expo-auth-session` are NOT.

## 2. Current code state (branch `fix/revision-arquitectura`)

- `login.tsx` / `signup.tsx`: `<SocialAuthButtons/>` usage **commented out**,
  imports **commented out** (keeps `noUnusedLocals` green).
- `SocialAuthButtons.tsx`: renders an honest "Próximamente" notice (Globe/Apple
  chips + `socialUnavailableLabel/Body`). This whole notice contract goes away.
- `social-auth-buttons.test.tsx`: pins the unavailable-notice contract
  (no buttons rendered). **Must be rewritten**, not extended.
- i18n keys `auth.socialUnavailableLabel` / `auth.socialUnavailableBody`
  (`src/core/i18n/strings.ts` ~L131-135): delete only after grep confirms no
  other references.
- `Button` (`components/ui/button.tsx`) already supports `loading`, `disabled`,
  `icon`, `iconPosition`. Reuse; do not invent a new button.

## 3. Branch

Create `feat/social-auth-oauth` from latest `main`. All work + single
conventional commit (`feat(mobile): ...`) on that branch. No push unless asked.

## 4. Human-owned dashboard setup (NOT the agent's job — checklist for the user)

Supabase callback to register everywhere:
`https://sxqopofoynsqkztozlix.supabase.co/auth/v1/callback`

1. **Google Cloud Console**: OAuth consent screen (External) → OAuth Client ID
   (Web application) → authorized redirect URI = Supabase callback above.
   Keep Client ID + Client Secret.
2. **Apple Developer**: Services ID (e.g. `com.fudi.role.signin`) with Sign in
   with Apple, Return URL = Supabase callback above. Sign-in-with-Apple Key:
   Key ID + Team ID + `.p8` (one-time download).
3. **Supabase Dashboard → Authentication → Providers**: enable Google
   (ID + secret) and Apple (Services ID + Team ID + Key ID + `.p8`).
4. **Supabase → URL Configuration → Redirect URLs** (allowlist, all three):
   - `role://callback` (native)
   - `https://<pwa-prod-domain>/callback` (PWA prod)
   - `http://localhost:8081/callback` (dev web)
   Site URL = PWA production URL.
5. **PWA-only Apple requirement**: serve `apple-developer-domain-association.txt`
   at `https://<pwa-prod-domain>/.well-known/` (file in
   `apps/mobile/public/.well-known/`; Vercel serves existing files before SPA
   rewrites, but verify after deploy).

## 5. Code tasks

- **T1 — Deps**: `npx expo install expo-web-browser` (pins SDK 57 build).
  Import `* as WebBrowser`; call `WebBrowser.maybeCompleteAuthSession()` at
  module top level (required for Android return).
- **T2 — Pure helpers + unit test** (repo rule: tests per logic change):
  new `src/features/auth/data/social-auth.ts`: `NATIVE_OAUTH_REDIRECT_URL`
  (`"role://callback"`) + `extractOAuthCode(url: string): string | null`,
  dependency-free so it runs in `bun test` with zero mocks. Web return uses
  `Linking.createURL("/callback")` at the call site (verified: it prefixes the
  current origin on web).
- **T3 — `signInWithProvider(provider: "google" | "apple")`** in new
  `src/features/auth/data/social-oauth.ts` (NOT in `repository.ts`: the sheet
  needs react-native imports and `repository.ts` must stay importable by unit
  tests without the native runtime; reuse `mapAuthError`/`Errors` taxonomy):
  - `const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })`; throw mapped error on failure.
  - **Native** (`Platform.OS !== "web"`): `redirectTo = "role://callback"`;
    `const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)`;
    user-dismissed (`res.type !== "success"`) = silent no-op (mirror Apple's
    `ERR_REQUEST_CANCELED` handling in ADR-0009); on success extract `code`
    and `await supabase.auth.exchangeCodeForSession(code)`. Store syncs via
    `onAuthStateChange` — do not set the store manually.
  - **Web**: `redirectTo = window.location.origin + "/callback"`; nothing else
    (library redirects; return page completes session via `detectSessionInUrl`).
- **T4 — Rewrite `SocialAuthButtons.tsx`**: real enabled outline buttons with
  provider icons (keep current lucide `Globe`/`Apple` look), per-provider
  `loading`, `onPress` wired to T3, error surfaced with the same UI pattern
  `login.tsx` uses for auth errors (mirror it, don't invent). Delete the
  "Próximamente" notice UI.
- **T5 — Re-enable usages**: uncomment component + imports in `login.tsx` and
  `signup.tsx` (pass existing `orContinueWith` / `orSignupWith` labels).
- **T6 — Callback route**: create `app/(auth)/callback.tsx` + register
  `<Stack.Screen name="callback" />` in `app/(auth)/_layout.tsx`. Renders
  `<LoadingView />`, then `router.replace("/")` once the store reports
  `authenticated` (or after a short settle so `detectSessionInUrl` finishes on
  web). Serves web returns and native cold-start links; warm native returns
  never navigate (handled inside `openAuthSessionAsync`).
- **T7 — i18n**: add keys for signing-in state and social errors (es-ES
  catalog, neutral register); remove the two `socialUnavailable*` keys after
  grep proves zero remaining references.
- **T8 — Verify profile hydration**: with a real Google login, confirm
  `handle_new_user` fills `profiles` (`full_name`/`avatar_url` from Google
  metadata) and defaults match email-signup rows; note Apple sends `fullName`
  only on first login and may hide email behind private relay (product caveat,
  not a blocker).
- **T9 — Docs**: supersede ADR-0009 (new short ADR or amendment: why Flow A
  replaced native SDKs — PWA coverage, one flow, less native config).
- **T10 — Rewrite `social-auth-buttons.test.tsx`**: new contract — renders two
  enabled buttons; pressing calls the sign-in entry with the right provider;
  loading state disables; no unavailable notice anywhere. Update any e2e auth
  stubs if the suite touches these screens (`apps/mobile/e2e/`, network is
  stubbed at the browser edge — real OAuth cannot complete in e2e).

## 6. Verification (all mandatory before "done")

```sh
bun run typecheck --filter=role-mobile...   # turbo: commons build + mobile tsc
bun run test --filter=role-mobile...        # or: bun test --isolate src (in apps/mobile)
bun run check   # biome on touched files (in apps/mobile)
```

Manual matrix (dashboards from §4 required): web Google, web Apple (verified
domain), native Google (dev build), native Apple (device/simulator),
dismiss-sheet no-op, offline/error mapped message, new-user profile row
created, existing-user login untouched.

## 7. Gotchas index

- Groups stripped from routes → `/callback`, not `/auth/callback`.
- `skipBrowserRedirect` missing from installed types — never pass it.
- Apple private-relay emails: login works, outbound email to the user doesn't.
- New native deps mean auth can no longer be tested in Expo Go (dev client).
- Old board: `docs/improvements/08-codigo-muerto.md` mentions social as
  deferred — update that note when this ships.
