# Guía de implementación — role-front-admin

**Audiencia:** agente de implementación o desarrollador humano  
**Objetivo:** llevar este admin a un estándar profesional del ecosistema **TanStack** + contratos compartidos con **role-api** y **role-commons**  
**Idioma de UI:** español  
**Fecha de referencia del diagnóstico:** 2026-07-20  

---

## 0. Cómo usar esta guía

### 0.1 Reglas de ejecución

1. Completar **una fase** y verificar su checklist antes de pasar a la siguiente.
2. Preferir commits atómicos por fase o sub-fase.
3. **No inventar campos de dominio.** Fuente de verdad = schemas/DTOs de `@0xc1x/role-commons`.
4. Si hay que editar `role-api` o `role-commons`, documentar el diff en la fase y **rebuild de commons** antes de consumir.
5. Paths de repos hermanos (fuera del workspace front):

| Repo | Path absoluto |
|------|----------------|
| Front admin | `/mnt/c/Users/leonardo/Repositories/role-front-admin` |
| API | `/mnt/c/Users/leonardo/Repositories/role-api` |
| Commons | `/mnt/c/Users/leonardo/Repositories/role-commons` |

6. No crear doble fuente de verdad (OpenAPI codegen paralelo a commons en v1).
7. No añadir librerías nuevas sin justificación (axios, redux, zustand, etc. están fuera de alcance salvo acuerdo explícito).

### 0.2 Stack ya instalado (no reinstalar a ciegas)

- `@tanstack/react-start`, `react-router`, `react-query`, `react-form`, `react-table`
- `@tanstack/react-router-ssr-query` (instalado; ver decisión SSR en §2.4)
- `@0xc1x/role-commons`, shadcn/Base UI, Tailwind 4, Biome, Vitest, Playwright

### 0.3 Decisiones de diseño fijadas (no reabrir en implementación)

| Tema | Decisión |
|------|----------|
| Fuente de verdad de tipos | `role-commons` (Zod + DTOs + entities) |
| HTTP client | `fetch` propio (no axios) |
| Server state | TanStack Query + `queryOptions` + key factories |
| Forms | TanStack Form + schemas de commons |
| Tables | TanStack Table; paginación **server-side** vía search params del router |
| Auth storage v1 | `localStorage` bearer + refresh (documentar riesgo XSS; httpOnly cookies = futuro) |
| SSR de datos auth | **No prioritario** — SPA client para `/auth/me` (tokens no disponibles en SSR) |
| OpenAPI codegen | No en v1 |
| Monorepo | No obligatorio; link local `file:../role-commons` recomendado |
| Feature plantilla | `categories` (CRUD admin ya existe en API) |
| Imágenes v1 | campo `image_url: string \| null`; upload real diferido |
| Errores HTTP v1 | parsear shape Nest actual (`statusCode`, `message`, `error`) — no forzar `ApiErrorSchema` de commons todavía |

---

## 1. Estado actual (diagnóstico)

### 1.1 Mapa del código hoy

```
src/
  routes/                 # file-based TanStack Router (páginas)
  features/
    auth/                 # forms + guards (parcial)
    categories/           # drawers, form, table (parcial, mock + tipos locales)
  components/             # shell + helpers datatable + ui/shadcn
  lib/
    api/                  # client, auth, categories, offers, orders, hooks monolítico
    hooks/use-auth.ts     # logout duplicado
  router.tsx              # QueryClient + createRouter
  config/, services/, types/, utils/  # vacíos o sin ownership
```

### 1.2 Ecosistema hermano

| Repo | Rol | Tech |
|------|-----|------|
| `role-api` | NestJS BFF, prefix `api/v1`, Scalar en `/docs` | Nest 11, Drizzle, Supabase Auth JWT, Zod via commons |
| `role-commons` | Contratos compartidos `@0xc1x/role-commons` | Zod 4, entities/DTOs/schemas por dominio |
| `role-front-admin` | Admin SPA | TanStack Start |

**No hay monorepo.**  
- API ya usa `"@0xc1x/role-commons": "file:../role-commons"`.  
- Front hoy usa `"^1.0.0"` (paquete publicado/local en node_modules).

### 1.3 Contrato canónico — Categories

**Entity / wire (`Category` / `CategoryDto`):**

```ts
{
  id: string
  name: string
  description: string | null
  emoji: string | null
  slug: string
  image_url: string | null
  active: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}
```

**List response:**

```ts
{ data: Category[], meta: { page, limit, total, total_pages } }
```

**Endpoints (`role-api`):**

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/v1/categories` | public |
| `GET` | `/api/v1/categories/:id` | public |
| `POST` | `/api/v1/categories` | admin |
| `PATCH` | `/api/v1/categories/:id` | admin |
| `DELETE` | `/api/v1/categories/:id` | admin (soft-delete) |

**Schemas commons:** `CategorySchema`, `CreateCategorySchema`, `UpdateCategorySchema`, `ListCategoriesQuerySchema` (`search`, `active`, `page`, `limit`).

### 1.4 Bugs y deudas que esta guía corrige (no preservarlos)

1. `categoriesApi.create` / `update` **no hacen `return`** → mutaciones reciben `undefined` (`src/lib/api/categories.ts`).
2. Query param incorrecto: `params.set('status', query.search)` debe ser `search`.
3. Página categorías híbrida: mock `getData` + `useCategoriesList` + `console.log` + acceso inseguro `categories.data.data` (`src/routes/_layout.categorias.tsx`).
4. Drift de tipos UI vs commons: UI usa `descripcion` / `is_active`; commons usa `description` / `active`.
5. Formulario de categoría es stub (no llama API).
6. Sin mutations create/update/delete de categorías en React Query.
7. Hooks monolíticos en `src/lib/api/hooks.ts`.
8. Sin query key factory ni `queryOptions`.
9. Router y Query no integrados (sin context, sin loaders/`ensureQueryData`).
10. Logout duplicado (`lib/api/hooks.ts` vs `lib/hooks/use-auth.ts`).
11. Divergencia de errores: Nest devuelve `{ statusCode, message, error, path, timestamp }`; commons `ApiErrorSchema` es `{ code, message, details }`.
12. Form acepta `File` pero el client siempre hace `JSON.stringify`.
13. Carpetas vacías sin ownership (`services/`, `types/`, `utils/`).
14. Typos: `singup`, `drawler`, `thumbail`, `toogle`, `nav-proyects`.
15. Offers/orders en client son consumer-oriented; no hay admin list global de órdenes en API.
16. Sin `.env.example`, tests reales ni docs de arquitectura (este archivo cubre la docs).

### 1.5 Auth API relevante

```
POST /auth/login      public  → AuthResponse { access_token, refresh_token, expires_at, user }
POST /auth/register   public  → crea cuenta con role admin (v1 shortcut en API)
POST /auth/refresh    public
GET  /auth/me         bearer  → { user: AuthUser }
```

`AuthUser.role`: `'user' | 'business' | 'admin'`. El panel solo admite `admin`.

---

## 2. Arquitectura objetivo

### 2.1 Principios

1. **Feature-first (Feature-Sliced light):** cada dominio admin vive en `src/features/<domain>/`.
2. **Contratos compartidos:** tipos y validación desde `@0xc1x/role-commons`.
3. **Capas claras:**
   - `lib/api/client` → transporte HTTP (auth, errors, refresh)
   - `features/*/api` → endpoints tipados (sin React)
   - `features/*/queries` → `queryOptions` + hooks React Query
   - `features/*/{components,forms,tables}` → UI
   - `routes/*` → thin: wiring, loaders, layout
4. **Reparto de estado:**
   - Server/async → TanStack Query
   - URL → TanStack Router search params
   - Forms → TanStack Form
   - Table UI (sort columns visibles, row selection local) → TanStack Table
5. **Sin store global** salvo necesidad real (sesión = Query cache + localStorage).
6. **Routes thin:** cero lógica de negocio en routes.

### 2.2 Estructura de carpetas objetivo

```
src/
  config/
    env.ts                      # VITE_* validados (zod)
    query-client.ts             # factory QueryClient (sale de router.tsx)
    navigation.ts               # items del sidebar (datos)
  lib/
    api/
      client.ts                 # fetch wrapper, tokens, refresh, ApiClientError
      errors.ts                 # parse Nest error → ApiClientError
      http.ts                   # toSearchParams, helpers
    utils.ts                    # cn()
  features/
    auth/
      api/auth.api.ts
      queries/auth.queries.ts
      forms/login.form.tsx
      forms/signup.form.tsx
      utils/guards.ts
      index.ts
    categories/
      api/categories.api.ts
      queries/categories.keys.ts
      queries/categories.queries.ts
      forms/category.form.tsx
      components/
        category-create-drawer.tsx
        category-update-drawer.tsx
      tables/
        categories.columns.tsx
        categories.table.tsx
      index.ts
    # futuros: offers, businesses, orders, users…
  components/
    layout/
      app-sidebar.tsx
      layout.tsx
      nav-main.tsx
      nav-user.tsx
      nav-projects.tsx
      logo.tsx
      theme-toggle.tsx
    data-table/
      column-header.tsx
      pagination.tsx
      view-options.tsx
      data-table.tsx            # shell genérico opcional
    media/
      image-field.tsx
      image-thumbnail.tsx
    ui/                         # shadcn — no reestructurar salvo bugs
  routes/
    __root.tsx
    index.tsx                   # redirect /home o /login
    login.tsx
    signup.tsx                  # renombrar desde singup.tsx
    _layout.tsx
    _layout.home.tsx
    _layout.categorias.tsx
  router.tsx
```

### 2.3 Ownership (tabla de decisión)

| Qué | Dónde |
|-----|--------|
| Primitives UI | `components/ui` |
| Shell / chrome | `components/layout` |
| DataTable genérico | `components/data-table` |
| Media helpers | `components/media` |
| Endpoints de un dominio | `features/<d>/api` |
| Query keys + hooks del dominio | `features/<d>/queries` |
| Forms / tables / drawers del dominio | `features/<d>/{forms,tables,components}` |
| Rutas | `routes/*` (importan desde features) |
| HTTP base | `lib/api/*` |
| Env / query client / nav config | `config/*` |

**Eliminar o no usar:** `src/services/`, `src/types/`, `src/utils/` si siguen vacíos. No crear una capa `services/` paralela a api/query.

### 2.4 Flujo de datos

```
Route loader (opcional)
  → context.queryClient.ensureQueryData(categoriesListOptions(search))
  → Page usa useCategoriesList(search)   // misma queryKey → cache hit
    → categoriesApi.list(search)
      → api.get('/categories?...')
        → role-api
  → Table / Form
    → useCreateCategory.mutate
      → invalidate categoriesKeys.lists()
```

### 2.5 Integración Router + Query

1. Mover `QueryClient` a `src/config/query-client.ts`.
2. Registrar en router context:

```ts
// src/router.tsx
import { getQueryClient } from '@/config/query-client'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = getQueryClient()
  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

3. Tipar el context del root route (o de `_layout`) con `{ queryClient: QueryClient }`.
4. En listados:

```ts
export const Route = createFileRoute('/_layout/categorias')({
  validateSearch: (raw) => categoriesSearchSchema.parse(raw),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(categoriesListOptions(deps)),
  component: CategoriesPage,
})
```

5. **SSR auth (decisión v1):** no forzar SSR de `/auth/me`. Tokens en `localStorage` no existen en server. Usar loaders **client-side** + `ensureQueryData` tras hidratar. No eliminar `@tanstack/react-router-ssr-query` del package; no bloquear arquitectura en él.
6. Auth guards:
   - `beforeLoad`: sin token → `redirect({ to: '/login' })`.
   - Tras login: `queryClient.setQueryData(authKeys.me(), user)`.
   - Layout: validar `user.role === 'admin'`.
   - Preferir `redirect` / `navigate` del router. Hard `window.location.href` solo como fallback fuera del árbol React (p. ej. refresh fallido en el client HTTP).

---

## 3. Capa API profesional

### 3.1 `src/config/env.ts`

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_URL: z
    .string()
    .url()
    .default('http://localhost:3000/api/v1'),
})

export const env = EnvSchema.parse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
})
```

> **Nota de puerto:** `role-api` README usa default `PORT=3000`. El client actual del front defaulta a `4001`. Unificar en `.env.example` y documentar. Preferir el puerto real de tu `.env` de la API.

### 3.2 `src/lib/api/errors.ts`

Shape Nest actual (`AllExceptionsFilter`):

```json
{
  "statusCode": 400,
  "message": "..." ,
  "error": "Bad Request",
  "path": "/api/v1/...",
  "timestamp": "..."
}
```

(`message` puede ser `string | string[]`.)

```ts
export class ApiClientError extends Error {
  status: number
  error?: string
  details?: unknown
  path?: string

  constructor(opts: {
    status: number
    message: string | string[]
    error?: string
    details?: unknown
    path?: string
  }) {
    const msg = Array.isArray(opts.message)
      ? opts.message.join(', ')
      : opts.message
    super(msg)
    this.name = 'ApiClientError'
    this.status = opts.status
    this.error = opts.error
    this.details = opts.details
    this.path = opts.path
  }
}

export async function throwFromResponse(response: Response): Promise<never> {
  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    throw new ApiClientError({
      status: response.status,
      message: `Request failed with status ${response.status}`,
    })
  }
  throw new ApiClientError({
    status: response.status,
    message: (body.message as string | string[]) ?? 'Unknown error',
    error: body.error as string | undefined,
    details: body.details,
    path: body.path as string | undefined,
  })
}
```

**Decisión v1:** no usar `ApiErrorSchema` de commons en el client (diverge del filter Nest).  
**Futuro (P3 en role-api):** alinear `AllExceptionsFilter` a `{ code, message, details }`.

### 3.3 `src/lib/api/http.ts`

```ts
export function toSearchParams(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
```

### 3.4 `src/lib/api/client.ts` — responsabilidades

- `API_BASE` desde `env.VITE_API_URL`.
- Token keys preferibles con prefijo: `role_admin_auth_token`, `role_admin_refresh_token`, `role_admin_token_expires_at` (migrar leyendo keys viejas una vez si hace falta).
- `request<T>(method, path, options?)`:
  - `skipAuth?: boolean`
  - `body?: unknown | FormData` — si `FormData`, **no** setear `Content-Type` manual
  - refresh proactivo (~5 min antes de expiry) + mutex (mantener patrón actual)
  - retry una vez en 401 tras refresh
  - errores vía `throwFromResponse`
  - **sin `console.log` de debug**
- Superficie:

```ts
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }) =>
    request<T>('POST', path, { body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
```

### 3.5 Resource module — patrón obligatorio

```ts
// src/features/categories/api/categories.api.ts
import type {
  CategoryDto,
  CategoryPaginatedData,
  CreateCategoryDto,
  ListCategoriesQuery,
  UpdateCategoryDto,
} from '@0xc1x/role-commons'
import { api } from '@/lib/api/client'
import { toSearchParams } from '@/lib/api/http'

export const categoriesApi = {
  list: (query?: ListCategoriesQuery) =>
    api.get<CategoryPaginatedData>(
      `/categories${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
    ),

  getById: (id: string) => api.get<CategoryDto>(`/categories/${id}`),

  create: (body: CreateCategoryDto) =>
    api.post<CategoryDto>('/categories', body),

  update: (id: string, body: UpdateCategoryDto) =>
    api.patch<CategoryDto>(`/categories/${id}`, body),

  remove: (id: string) => api.delete<CategoryDto>(`/categories/${id}`),
}
```

**Reglas del resource:**

- Siempre `return` de la promesa.
- Solo keys del schema commons en query (`search`, `active`, `page`, `limit`).
- Tipos de commons — **prohibido** redefinir `type Category` local distinto.
- Sin React Query en este archivo.

Mover/reescribir de forma análoga:

- `features/auth/api/auth.api.ts` (desde `lib/api/auth.ts`)
- Mantener temporalmente `lib/api/offers.ts` y `lib/api/orders.ts` o moverlos a features cuando existan pantallas admin. No inventar endpoints admin que la API no tenga.

### 3.6 Query keys + queryOptions

```ts
// src/features/categories/queries/categories.keys.ts
import type { ListCategoriesQuery } from '@0xc1x/role-commons'

export const categoriesKeys = {
  all: ['categories'] as const,
  lists: () => [...categoriesKeys.all, 'list'] as const,
  list: (params?: ListCategoriesQuery) =>
    [...categoriesKeys.lists(), params ?? {}] as const,
  details: () => [...categoriesKeys.all, 'detail'] as const,
  detail: (id: string) => [...categoriesKeys.details(), id] as const,
}
```

```ts
// src/features/categories/queries/categories.queries.ts
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  CreateCategoryDto,
  ListCategoriesQuery,
  UpdateCategoryDto,
} from '@0xc1x/role-commons'
import { categoriesApi } from '../api/categories.api'
import { categoriesKeys } from './categories.keys'

export const categoriesListOptions = (params?: ListCategoriesQuery) =>
  queryOptions({
    queryKey: categoriesKeys.list(params),
    queryFn: () => categoriesApi.list(params),
    staleTime: 30_000,
  })

export function useCategoriesList(params?: ListCategoriesQuery) {
  return useQuery(categoriesListOptions(params))
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCategoryDto) => categoriesApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesKeys.lists() })
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryDto }) =>
      categoriesApi.update(id, body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: categoriesKeys.lists() })
      qc.setQueryData(categoriesKeys.detail(data.id), data)
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesKeys.all })
    },
  })
}
```

**Auth (mismo patrón):**

```ts
// features/auth/queries — esqueleto
authKeys = { all: ['auth'], me: () => [...authKeys.all, 'me'] }
useAuthUser → enabled: !!getToken(), retry: false, staleTime: 5 * 60_000
useLogin → setQueryData(authKeys.me(), data.user)
useRegister → igual
useLogout → clearAuth + queryClient.clear() + navigate('/login')
```

**Eliminar tras migrar imports:**

- `src/lib/api/hooks.ts`
- `src/lib/hooks/use-auth.ts` (unificar en feature auth)

### 3.7 QueryClient defaults

```ts
// src/config/query-client.ts
import { QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '@/lib/api/errors'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          if (error instanceof ApiClientError) {
            if (error.status === 401 || error.status === 403 || error.status === 404) {
              return false
            }
          }
          return count < 1
        },
        refetchOnWindowFocus: false,
      },
    },
  })
}

// singleton para SPA
let client: QueryClient | undefined
export function getQueryClient() {
  if (!client) client = createQueryClient()
  return client
}
```

---

## 4. Feature plantilla — Categories E2E

Categories es el **estándar** que el resto de features debe copiar.

### 4.1 Alinear tipos

- Borrar el type local en `categories.columns.tsx`.
- Usar `import type { Category } from '@0xc1x/role-commons'` (o `CategoryDto`).
- Columnas: `description`, `active` (nunca `descripcion` / `is_active`).
- Badge: Activo si `active === true`.

### 4.2 Formulario (`category.form.tsx`)

- Validators: `CreateCategorySchema` / `UpdateCategorySchema` de commons.
- Defaults desde entity commons.
- Submit:
  - create → `useCreateCategory().mutateAsync(payload)`
  - update → `useUpdateCategory().mutateAsync({ id, body })`
- Errores: mostrar `error instanceof ApiClientError ? error.message : 'Error inesperado'`.
- **Imagen v1:** enviar `image_url: string | null`.
  - Si el UI actual usa `File`, adaptar a:
    - input URL + preview, **o**
    - preview local del File **sin** subirlo (no enviar File al API JSON).
  - Upload real = Fase 6 / role-api Storage (no bloquear CRUD).

Payload create ejemplo:

```ts
{
  name: value.name,
  description: value.description ?? null,
  emoji: value.emoji ?? null,
  slug: value.slug || undefined, // API puede generar desde name
  image_url: typeof value.image === 'string' ? value.image : null,
  active: value.active ?? true,
}
```

### 4.3 Drawers

- Renombrar `*drawler*` → `*drawer*`.
- Create: cierra en `onSuccess`, resetea form.
- Update: controlado `open` / `onClose`, recibe `category: Category`.
- Footer: `type="submit" form={FORM_ID}` + disable si `isPending`.

### 4.4 Table

- Data **solo** de API (`data.data` con optional chaining + empty array fallback).
- Paginación server-side:
  - search params: `page`, `limit`, `search`, `active?`
  - UI lee `meta.page`, `meta.total_pages`, `meta.total`
- Search: debounce 300ms → `navigate({ search: (prev) => ({ ...prev, search, page: 1 }) })`.
- Delete: confirm (`window.confirm` v1 o `AlertDialog`) → `useDeleteCategory`.
- Estados: loading skeleton, error message + retry, empty state.
- Columns y row actions en el feature; shell genérico en `components/data-table` si se reutiliza.

### 4.5 Route `_layout.categorias.tsx` (objetivo ~30–60 líneas)

```tsx
// Esqueleto objetivo
export const Route = createFileRoute('/_layout/categorias')({
  validateSearch: (raw) => /* zod page/limit/search/active */,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(categoriesListOptions(deps)),
  component: CategoriesPage,
  head: () => ({ meta: [{ title: 'Categorías | Role' }] }),
})

function CategoriesPage() {
  const search = Route.useSearch()
  const { data, isLoading, isError, error, refetch } = useCategoriesList(search)
  // header + CategoryCreateDrawer + table + pagination
}
```

Sin mocks. Sin `console.log`.

### 4.6 Search schema de la ruta

```ts
import { z } from 'zod'

export const categoriesSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  active: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      if (typeof v === 'boolean') return v
      return v === 'true'
    }),
})
```

Alinear con `ListCategoriesQuery` de commons cuando se pase al API.

---

## 5. Auth + shell + router

### 5.1 Auth feature

- Un solo `useLogout` en `features/auth/queries`.
- Login/register: `LoginRequestSchema` / `RegisterRequestSchema` de commons en TanStack Form.
- Post-login: si `user.role !== 'admin'` → `clearAuth()` + clear query cache + mensaje UX.
- Guest guard: `redirectIfAuthenticated` en `/login` y `/signup`.
- Layout `_layout`:
  - `beforeLoad`: token required
  - component: `useAuthUser`; loading skeleton; error → login; role check admin

### 5.2 Router / paths

| Acción | Detalle |
|--------|---------|
| Renombrar | `routes/singup.tsx` → `routes/signup.tsx` (path `/signup`) |
| Actualizar links | Login form, nav, etc. |
| Index | Redirect: token → `/home`, else → `/login` |
| Regenerar routes | `bun run generate-routes` o dejar que el plugin lo haga en dev |

### 5.3 Layout components

- Mover shell a `components/layout/*`.
- Nav config a `config/navigation.ts`.
- Sidebar: solo rutas reales (`/home`, `/categorias`). Placeholders futuros: omitir o marcar disabled (no `url: "#"` en producción).
- Renombrar typos globales:
  - `image-thumbail` → `image-thumbnail`
  - `toogle-visibility-columns-datatable` → `view-options` (en data-table)
  - `nav-proyects` → `nav-projects`
  - drawers `drawler` → `drawer`

### 5.4 Data-table compartido

Mover a `components/data-table/`:

- `column-header.tsx` (desde `header-columns-datatable.tsx`)
- `pagination.tsx` (desde `pagination-datatable.tsx`)
- `view-options.tsx` (desde `toogle-visibility-columns-datatable.tsx`)

Actualizar todos los imports.

---

## 6. Cambios en `role-commons` (opcional)

**Mínimo para categories:** no requiere cambios de schema.

| Cambio | Prioridad | Motivo |
|--------|-----------|--------|
| Link `file:../role-commons` en front `package.json` | P1 DX | Paridad con role-api |
| Documentar en README de commons el shape Nest error vs `ApiErrorSchema` | P2 | Claridad |
| `AuthResponseSchema` zod (validar login response en client) | P3 | Nice-to-have |

**Workflow local:**

```bash
cd /mnt/c/Users/leonardo/Repositories/role-commons
bun run build

cd /mnt/c/Users/leonardo/Repositories/role-front-admin
# package.json: "@0xc1x/role-commons": "file:../role-commons"
bun install
```

**Nunca** editar solo `dist/`; siempre `src/` + `bun run build`.

---

## 7. Cambios en `role-api` (opcional / no bloqueantes)

**Categories CRUD admin ya existe.** No bloquear el refactor del front.

| Prioridad | Cambio | Motivo |
|-----------|--------|--------|
| P1 doc | Alinear puerto documentado (3000 vs 4001) y CORS para `http://localhost:3000` (front Vite) | DX |
| P2 | `GET /orders` admin global con filtros | Panel órdenes |
| P2 | CRUD offers admin | Sidebar futuro |
| P2 | Admin users/businesses | Roadmap |
| P3 | Upload imagen (Supabase Storage) | Form File real |
| P3 | Alinear `AllExceptionsFilter` a `{ code, message, details }` | Consistencia con commons |

Si se edita la API, paths:

- Controllers: `role-api/src/modules/**`
- Filter: `role-api/src/common/filters/http-exception.filter.ts`
- OpenAPI manual: `role-api/src/openapi/spec.ts` (mantener sincronizado)

---

## 8. Fases de implementación (orden estricto)

### Fase 0 — Preparación y DX

**Objetivo:** entorno reproducible.  
**No** reestructurar features aún.

- [ ] Crear `.env.example`:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

- [ ] Añadir `zod` como dependencia **directa** del front.
- [ ] Opcional recomendado: `"@0xc1x/role-commons": "file:../role-commons"` + rebuild commons + `bun install`.
- [ ] Crear `src/config/env.ts`.
- [ ] Verificar role-api up: `GET {API}/health` y `GET {API}/categories`.
- [ ] Baseline: `bun run check` (o lint) documentando deuda conocida.

**Commit sugerido:** `chore: env example, zod dep, config env`

---

### Fase 1 — Capa HTTP sólida

**Objetivo:** client y resources correctos.

- [ ] Extraer `errors.ts`, `http.ts`.
- [ ] Refactor `client.ts` (FormData-ready, sin logs, put/delete, error parse).
- [ ] Arreglar categories API: `return`, query `search`, `getById`, `remove`.
- [ ] Revisar auth/offers/orders resources (returns y params).
- [ ] Tests Vitest mínimos (mock `fetch`): parse error, `toSearchParams`, skipAuth.
- [ ] Smoke manual: list categories autenticado/no autenticado según endpoint.

**Commit sugerido:** `refactor(api): solidify http client and category resource`

---

### Fase 2 — React Query architecture

**Objetivo:** keys, queryOptions, mutations; matar hooks monolíticos.

- [ ] `config/query-client.ts` + defaults (retry selectivo).
- [ ] `features/auth/api` + `features/auth/queries`.
- [ ] `features/categories/api` + `keys` + `queries` (list/create/update/delete).
- [ ] Migrar todos los imports; eliminar `lib/api/hooks.ts` y logout duplicado.
- [ ] Checklist manual: login → me → list → create → list se invalida.

**Commit sugerido:** `feat(query): co-locate auth and categories query modules`

---

### Fase 3 — Categories E2E + UI del feature

**Objetivo:** feature 100% real y estructura de carpetas del feature.

- [ ] Mover drawers/forms/tables a nombres/paths objetivo.
- [ ] Alinear columns/form a commons + schemas.
- [ ] Wire drawers + mutations.
- [ ] Route limpia + search params + server pagination con `meta`.
- [ ] Loading / error / empty.
- [ ] Renombrar `drawler` → `drawer`.
- [ ] Checklist manual CRUD + soft delete.

**Commit sugerido:** `feat(categories): end-to-end crud with server pagination`

---

### Fase 4 — Router, auth shell, layout

**Objetivo:** navegación y guards profesionales.

- [ ] Router `context: { queryClient }`.
- [ ] Loaders `ensureQueryData` en categorías.
- [ ] Fix `/signup`, index redirect.
- [ ] `config/navigation.ts` + sidebar limpio.
- [ ] Reorganizar `components/layout` + `components/data-table` + renames.
- [ ] Reducir hard redirects donde el router baste.
- [ ] Checklist: deep link `/categorias?page=2`, F5 mantiene sesión, guest no entra a layout.

**Commit sugerido:** `refactor(router): query context, shell layout, path fixes`

---

### Fase 5 — Calidad, tests, docs

**Objetivo:** estándar mantenible.

- [ ] Tests: keys, schema validation, opcional render de columns.
- [ ] Playwright smoke (login si hay credenciales de test; si no, documentar skip).
- [ ] README: arquitectura breve + enlace a esta guía + env + scripts.
- [ ] Biome clean; cero `console.log` de debug en paths productivos.
- [ ] Pin versiones TanStack que estén en `latest` (recomendado para builds reproducibles).
- [ ] Checklist global §10.

**Commit sugerido:** `chore: tests, docs, pin deps, cleanup`

---

### Fase 6 — Extensión de dominio (post-estándar)

Solo cuando categories sea plantilla estable:

1. Offers admin (requiere write API).
2. Orders admin list (endpoint global en role-api).
3. Businesses (commons listo; API no).
4. Upload de imágenes.

**Plantilla de nuevo feature:**

```
features/<domain>/
  api/<domain>.api.ts
  queries/<domain>.keys.ts
  queries/<domain>.queries.ts
  forms/
  components/
  tables/
  index.ts
routes/_layout.<domain>.tsx
config/navigation.ts  # entry
```

---

## 9. Estándares de código (obligatorios)

1. TypeScript strict; sin `any` injustificado.
2. Imports con alias `@/`.
3. Validar inputs con Zod de commons; no duplicar reglas de negocio en el front.
4. Components no hacen `fetch` directo; usan hooks del feature.
5. Archivos en **kebab-case** (`category-create-drawer.tsx`).
6. Copy de UI en **español** consistente.
7. Accesibilidad: labels/aria de patrones shadcn.
8. Prohibido añadir axios/redux/etc. sin acuerdo.
9. Prohibido OpenAPI codegen en v1 (commons es la fuente de verdad).
10. Mensajes de commit por fase (ver §8).

---

## 10. Criterios de aceptación globales

- [ ] Login admin funciona; non-admin es rechazado con mensaje claro.
- [ ] Sesión sobrevive a refresh de página; refresh token funciona.
- [ ] `/categorias` lista datos reales de role-api con paginación `meta`.
- [ ] Crear / editar / soft-delete invalida cache y actualiza UI.
- [ ] Tipos UI = commons (`description`, `active`).
- [ ] Sin mocks ni `console.log` de debug en paths productivos.
- [ ] No existe `lib/api/hooks.ts` monolítico.
- [ ] Cada feature tiene `api` + `queries` co-localizados.
- [ ] `bun run check` y `bun run build` pasan.
- [ ] Un dev nuevo puede levantar front + api + commons en <30 min con README + esta guía.

---

## 11. Anti-patrones (lista explícita)

- Redefinir `type Category` local distinto a commons.
- Llamar `api.post` sin `return`.
- `useQuery({ queryKey: ['categories'] })` suelto en routes sin factory.
- Duplicar hooks de logout.
- Tokens en `document.cookie` ad-hoc sin diseño.
- Lógica de negocio dentro de `components/ui`.
- Carpeta `services/` cajón de sastre.
- Tratar offers/orders consumer como admin sin endpoints admin.
- Codegen OpenAPI que diverja de commons.
- Mezclar mock y API real en la misma página.
- Mapear `search` → query param `status`.

---

## 12. Plantilla de PR por fase

```markdown
## Resumen
Fase X — <título>

## Repos tocados
- [ ] role-front-admin
- [ ] role-api
- [ ] role-commons

## Cómo probar
1. ...
2. ...

## Checklist de la fase
- [ ] ...

## Follow-ups
- ...
```

---

## 13. Snippets de referencia (copy-paste)

### 13.1 `toSearchParams`

Ver §3.3.

### 13.2 Keys + list options

Ver §3.6.

### 13.3 Create mutation con invalidación

Ver `useCreateCategory` en §3.6.

### 13.4 Route con search + loader

Ver §4.5.

### 13.5 Form + schema commons (patrón)

```tsx
import { useForm } from '@tanstack/react-form'
import { CreateCategorySchema } from '@0xc1x/role-commons'
import { useCreateCategory } from '../queries/categories.queries'
import { ApiClientError } from '@/lib/api/errors'

const createMutation = useCreateCategory()

const form = useForm({
  defaultValues: {
    name: '',
    description: '',
    slug: '',
    emoji: '',
    image_url: null as string | null,
    active: true,
  },
  validators: {
    onSubmit: CreateCategorySchema,
  },
  onSubmit: async ({ value }) => {
    try {
      await createMutation.mutateAsync({
        name: value.name,
        description: value.description || null,
        slug: value.slug || undefined,
        emoji: value.emoji || null,
        image_url: value.image_url,
        active: value.active,
      })
      onSuccess?.()
    } catch (e) {
      // surface e instanceof ApiClientError
      throw e
    }
  },
})
```

> Ajustar el adapter exacto de Zod ↔ TanStack Form según la versión instalada (`validators.onSubmit` puede requerir wrapper). Si el schema de commons no calza 1:1 con defaultValues del form, usar `.pick` / schema de formulario derivado **sin** relajar reglas de negocio del API.

### 13.6 Error Nest → mensaje UI

```ts
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return 'Error inesperado'
}
```

---

## 14. Roadmap visual

```
[F0 DX] → [F1 HTTP] → [F2 Query] → [F3 Categories E2E] → [F4 Router/Shell] → [F5 Quality]
                                                                              │
                                                                              ▼
                                                    [F6 Next admin domains + role-api endpoints]
```

---

## 15. Orden de trabajo recomendado para el agente (checklist operativa)

```
1. Leer este archivo completo.
2. Leer package.json, src/lib/api/*, features/categories/*, routes/_layout*.tsx.
3. Leer role-commons categories schemas y role-api categories.controller.ts.
4. Ejecutar Fase 0.
5. Ejecutar Fase 1 y tests de client.
6. Ejecutar Fase 2 y probar login + list en UI o con logs temporales (borrar logs).
7. Ejecutar Fase 3 hasta CRUD real en /categorias.
8. Ejecutar Fase 4 (router context + shell).
9. Ejecutar Fase 5 (calidad).
10. Detenerse. No empezar Fase 6 sin confirmación del usuario.
```

---

## 16. Referencias rápidas de archivos actuales → destino

| Actual | Destino |
|--------|---------|
| `src/lib/api/client.ts` | `src/lib/api/client.ts` (refactor) + `errors.ts` + `http.ts` |
| `src/lib/api/auth.ts` | `src/features/auth/api/auth.api.ts` |
| `src/lib/api/categories.ts` | `src/features/categories/api/categories.api.ts` |
| `src/lib/api/hooks.ts` | **eliminar** → queries por feature |
| `src/lib/hooks/use-auth.ts` | **eliminar** → `features/auth/queries` |
| `src/features/categories/components/category.drawler.tsx` | `.../category-create-drawer.tsx` |
| `src/features/categories/components/update.category.drawler.tsx` | `.../category-update-drawer.tsx` |
| `src/routes/singup.tsx` | `src/routes/signup.tsx` |
| `src/router.tsx` QueryClient | `src/config/query-client.ts` |
| `src/components/header-columns-datatable.tsx` | `src/components/data-table/column-header.tsx` |
| `src/components/pagination-datatable.tsx` | `src/components/data-table/pagination.tsx` |
| `src/components/toogle-visibility-columns-datatable.tsx` | `src/components/data-table/view-options.tsx` |
| `src/components/image-thumbail.tsx` | `src/components/media/image-thumbnail.tsx` |
| `src/components/image-field.tsx` | `src/components/media/image-field.tsx` |
| Shell (`layout`, `app-sidebar`, `nav-*`, `logo`, `theme-toggle`) | `src/components/layout/*` |

---

## 17. Definición de “hecho” para el agente

La implementación de esta guía se considera **completa (F0–F5)** cuando:

1. Categories CRUD real funciona contra role-api.
2. La estructura de carpetas del §2.2 está aplicada al menos para `auth`, `categories`, `lib/api`, `config`, `components/{layout,data-table,media}`.
3. No quedan los bugs del §1.4.
4. Checklists de F0–F5 están marcados.
5. Build y lint pasan.

**No** se requiere Fase 6 para cerrar el trabajo de estandarización.
