# Deploy — API en Render · Landing y PWA mobile en Vercel

Guía de deploy productivo para `apps/api` (Render), `apps/landing` (Vercel, CLI)
y `apps/mobile` web/PWA (Vercel, CLI). `apps/admin` aún no tiene deploy configurado.

## Arquitectura de deploy

```
push a main ──► Render (role-api)          # auto-deploy: build + start en cada push
                ▲
                │ CORS / HTTPS
bun run deploy:landing ──► Vercel (role-landing)   # CLI: build local + deploy --prebuilt
bun run deploy:mobile  ──► Vercel (role-mobile)    # CLI: export estático + deploy --prebuilt
```

- **API**: Render hace build desde el repo (necesita `packages/commons` compilado antes de
  compilar `apps/api` — ver buildCommand). Inyecta `PORT`; la API lo lee en `main.ts`.
  Health check: `/api/v1/health`.
- **Landing**: el build usa Nitro con preset `vercel` y genera `.vercel/output`
  (Build Output API). `@0xc1x/role-commons` es `workspace:*`, así que turbo compila
  commons antes del build de landing (`--filter=role-landing...`).
- Las envs `VITE_*` de la landing se inlinan **en build time**: si cambian, hay que
  re-deployar.

---

## API en Render

### Crear el servicio

**Opción A — Blueprint (recomendada):** Render Dashboard → **New → Blueprint** →
conectar el repo. Render lee el `render.yaml` de la raíz y pide los valores de los
env vars marcados `sync: false`.

**Opción B — Manual:** Render Dashboard → **New → Web Service** → conectar el repo:

| Setting | Valor |
| --- | --- |
| Runtime | Node (las imágenes nativas de Render incluyen bun) |
| Build Command | `bun install --frozen-lockfile && bun run --cwd packages/commons build && bun run --cwd apps/api build` |
| Start Command | `bun run --cwd apps/api start:prod` (≡ `node dist/main`) |
| Health Check Path | `/api/v1/health` |
| Auto-Deploy | Yes (deploy en cada push a `main`) |

### Env vars de la API

Definidas y validadas por `apps/api/src/config/env.schema.ts` (la API no arranca si
falta una requerida o si en producción `CORS_ORIGINS` es `*`):

| Variable | Requerida | Notas |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Pooler de Supabase: `postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `SUPABASE_JWT_SECRET` | ✅ | Project Settings → API → JWT Secret |
| `SUPABASE_ANON_KEY` | ✅ | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Secret — solo servidor |
| `CORS_ORIGINS` | ✅ (prod) | URLs explícitas separadas por coma; p. ej. la URL de Vercel + admin. No usar `*` |
| `DOCS_USER` / `DOCS_PASSWORD` | ✅ (prod) | Basic auth de `/docs` |
| `NODE_ENV` | ✅ | `production` (el Blueprint ya lo define) |
| `SUPABASE_STORAGE_BUCKET` | — | default `images` |
| `REDIS_URL` | — | vacío = colas en ejecución directa (sin BullMQ) |
| `RESEND_API_KEY` | — | vacío = envío de emails deshabilitado |
| `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, `UNSUBSCRIBE_URL_BASE` | — | email marketing; `UNSUBSCRIBE_URL_BASE` debe apuntar a la URL pública de la API |
| `FCM_SERVICE_ACCOUNT`, `FCM_PROJECT_ID`, `EXPO_ACCESS_TOKEN` | — | push notifications |

### Verificación post-deploy

```sh
curl -i https://<render-url>/api/v1/health   # 200
```

---

## Landing en Vercel (CLI)

### One-time setup

```sh
bunx vercel login                                # cuenta/team
cd apps/landing
bunx vercel link --yes --project role-landing    # crea/linkea el proyecto (no-interactivo)
```

> ⚠️ Al linkear, la CLI crea un `.env.local` con un `VERCEL_OIDC_TOKEN` del proyecto
> y añade `.vercel`/`.env*` al `.gitignore` del app. El token se puede borrar (no se
> usa en dev) y el `.gitignore` de la raíz ya cubre ambos patrones; `.env*` ignoraría
> `.env.example`, así que reviértelo: `git checkout apps/landing/.gitignore`.

Cargar las envs de build (se inlinan en build time; `production` para deploys
`--prod`, repetir con `preview` si se usa QA):

```sh
cd apps/landing
bunx vercel env add VITE_API_URL production          # https://<render-url>/api/v1 (¡incluye /api/v1!)
bunx vercel env add VITE_SUPABASE_URL production     # https://<ref>.supabase.co
bunx vercel env add VITE_SUPABASE_ANON_KEY production
```

Y traerlas al repo para el build local (el CLI compila en tu máquina; Vite lee
`.env.production.local` con prioridad sobre el `.env` de dev):

```sh
cd apps/landing && bunx vercel env pull .env.production.local
```

### Deploy

```sh
bun run deploy:landing        # desde la raíz: build turbo (commons → landing) + vercel deploy --prebuilt --prod
```

Equivale a:

```sh
NITRO_PRESET=vercel bun run build --filter=role-landing...   # commons + landing → .vercel/output
cd apps/landing && bunx vercel deploy --prebuilt --prod
```

Deploy de preview (no toca producción): desde `apps/landing`,
`bunx vercel deploy --prebuilt` (sin `--prod`). Requiere las envs de `preview`
(`vercel env add ... preview`) y `vercel env pull .env.preview.local` si se quiere
build local con esas mismas envs.

> **`Error: fetch failed` al deployar**: suele ser transitorio (la subida del output
> es la request más grande del flujo). Reintentar; si persiste, correr con
> `bunx vercel deploy --prebuilt --prod --debug` para ver el error de red real.

---

## PWA mobile en Vercel (CLI)

El export web de Expo (`apps/mobile`) se deploya como sitio estático (PWA) al
proyecto `role-mobile`, con el mismo flujo prebuilt que la landing.

### One-time setup

```sh
cd apps/mobile && bunx vercel link --yes --project role-mobile
```

> Misma advertencia que con la landing: la CLI crea un `.env.local` con un token
> OIDC y añade patrones al `.gitignore` del app — se pueden borrar/revertir.

Cargar las envs de build (se inlinan en `expo export`; todas son públicas/anon):

```sh
cd apps/mobile
bunx vercel env add EXPO_PUBLIC_API_URL production                 # https://<render-url>/api/v1
bunx vercel env add EXPO_PUBLIC_SUPABASE_URL production
bunx vercel env add EXPO_PUBLIC_SUPABASE_ANON_KEY production
bunx vercel env add EXPO_PUBLIC_ENVIRONMENT production            # production
bunx vercel env add EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL production
bunx vercel env add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY production
bunx vercel env add EXPO_PUBLIC_SENTRY_DSN production
bunx vercel env add EXPO_PUBLIC_FIREBASE_API_KEY production       # web push de la PWA
bunx vercel env add EXPO_PUBLIC_FIREBASE_PROJECT_ID production
bunx vercel env add EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
bunx vercel env add EXPO_PUBLIC_FIREBASE_APP_ID production
bunx vercel env add EXPO_PUBLIC_FIREBASE_VAPID_KEY production
```

Y traerlas al repo: Expo inlina `.env.production.local` durante el export y
`generate-firebase-config` lo usa para el service worker de push:

```sh
cd apps/mobile && bunx vercel env pull .env.production.local
```

### Deploy

```sh
bun run deploy:mobile   # desde la raíz: commons + export web + fix de assets + BOA + vercel deploy --prebuilt --prod
```

### Qué hace el pipeline (scripts de `apps/mobile`)

1. `preexport:web` — genera `public/firebase-config.js` (config de web push) desde
   `.env.production.local` si existe, si no `.env`.
2. `expo export --platform web` — export estático a `dist/`.
3. `scripts/fix-web-dist.mjs` — aplana los assets que Metro dejó bajo rutas de
   `node_modules` (el CLI de Vercel excluye cualquier directorio con ese nombre) a
   `assets/__nm/` y reescribe las referencias en los bundles.
4. `scripts/build-vercel-output.mjs` — ensambla `.vercel/output` (Build Output API
   v3): copia `dist/` a `static/` y traduce `vercel.json` (SPA rewrite + cache
   headers de la PWA) al `config.json`.
5. `vercel deploy --prebuilt --prod`.

---

## Cableado final y mantenimiento

1. **CORS**: en Render, `CORS_ORIGINS` = URL de producción de Vercel
   (p. ej. `https://role-landing.vercel.app`). Si luego se agrega dominio custom,
   actualizar la variable y redeploy.
2. **Dominio custom en Vercel**: Dashboard → Project → Domains. Requiere actualizar
   `CORS_ORIGINS` en Render.
3. **Free tier de Render**: el servicio se duerme por inactividad (cold starts de
   ~30 s). Sin `REDIS_URL` las colas corren en modo directo.
4. Nunca commitear secrets: Render y Vercel guardan las env vars en sus dashboards.
