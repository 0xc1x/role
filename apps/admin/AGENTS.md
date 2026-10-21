# Role Front Admin — Agent Guide (TanStack)

Guía de agente de `apps/admin`, alineada al ecosistema TanStack. La raíz del monorepo (`AGENTS.md`) define las reglas globales.

## Rol en el ecosistema

Panel de administración de Rolé: negocios, órdenes, ofertas, slides, categorías. SPA + SSR (TanStack Start), consume la API REST (`VITE_API_URL`, default `http://localhost:4001/api/v1`) y los contratos de `commons` para tipar.

## Stack

| Capa | Librería |
|---|---|
| Framework | TanStack Start (React 19) |
| Routing | TanStack Router (file-based) |
| Server state | TanStack Query |
| Forms | TanStack Form |
| Tables | TanStack Table |
| Styles | Tailwind 4 + shadcn/Base UI |
| HTTP | `fetch` nativo |
| Tipos | `@0xc1x/role-commons` (`workspace:*`) |
| Lint/Format | Biome |
| Tests | bun:test (`bun test --isolate src`) |

## Estructura (feature-first)

```
src/
├── routes/            # file-based; routeTree.gen.ts es GENERADO — no editar
├── features/<dominio>/  # {api, forms, hooks, queries, tables}
├── components/ui/     # shadcn/Base UI
├── lib/api/           # capa HTTP profesional (client, errors)
├── config/env.ts
└── hooks/
```

## Convenciones

- **Resource module** (patrón obligatorio): feature = api + queries (query keys/`queryOptions`) + table/form.
- **Forms con react-form + zod**: los schemas vienen de `commons` — la fuente de verdad es el contrato, no dupliques campos.
- **No editar `routeTree.gen.ts`**: corre `bun run generate-routes`.
- **Lint/format**: Biome (`bun run check`), no prettier/eslint.
- Fuente de verdad de tipos = schemas/DTOs de `@0xc1x/role-commons`; si falta un campo, se actualiza el contrato en `packages/commons` (ver `docs/contracts.md`).

## Comandos

```sh
bun run dev             # Vite dev (:3000)
bun run build           # build producción (vite + nitro)
bun run generate-routes # regenerar route tree
bun run test            # bun:test
bun run typecheck       # tsc --noEmit
bun run check           # biome (lint + format)
```

## Verificación antes de declarar done

```sh
bun run typecheck && bun run check && bun run test
```

## Estado conocido

Sin errores pendientes de typecheck ni lint (`bun run check` y `bun run typecheck` pasan limpios).

Notas de mantenimiento:

- **El `<form>` del login lleva `method="post"` a propósito.** Un form que
  lleva credenciales no puede ser un GET: sin JS (o sin hidratación) el
  navegador lo envía solo, y un GET mete la contraseña en la URL, el historial
  y los logs. Con `post`, el camino degradado manda las credenciales en el
  cuerpo. Está fijado por el e2e "without JavaScript the credentials never
  reach the URL" (`e2e/auth.login.spec.ts`).
- **La suite corre con `--isolate` y el DOM se instala en el PRELOAD.** Son las
  dos mitades del mismo problema: en bun el registro de módulos es del proceso,
  así que un spec puede cambiar el mundo de los otros noventa y uno. Medido en
  el mismo commit: 642/642 en un clon y 423 pass / 129 fail / 9 errors (552
  tests, 117 s) en otro, sin que cambiara una línea —el orden de archivos lo da
  el filesystem—. Las dos causas:
  - `@base-ui/utils` decide en el ámbito del módulo si hay DOM
    (`useIsoLayoutEffect = typeof document !== "undefined" ? … : noop`). Por eso
    el DOM se instala en `test-preload.ts` (bun lo ejecuta antes de importar el
    primer spec) y no en `test-utils/dom.ts` (que se importa donde le place al
    spec: hay specs que importan el componente bajo prueba antes que el helper,
    y entonces base-ui queda en modo SSR y sus portales no abren).
  - `mock.module` de bun es global al proceso. Un mock que reemplaza un módulo
    ENTERO le borra al resto de la suite las exportaciones que no declara: por
    eso todo mock de `@tanstack/react-router` reparte `...actualRouter` y su
    `Link` renderiza sus hijos. Un mock que no lo hace rompe el link de las rutas
    (`SyntaxError: Export named 'createFileRoute' not found`) y borra el texto
    de los enlaces que otros specs esperan.
- Los primitivos vendidos en `src/components/ui/**` tienen overrides de reglas
  a11y/suspicious en `biome.json` (patrón estándar para shadcn/Base UI). Si
  actualizas un primitivo, conserva los overrides.
- Los forms usan render-prop JSX (`<form.Field name="x">{(field) => …}</form.Field>`);
  no uses el prop `children={…}` (lo marca `noChildrenProp`).
- **El `includes` de `biome.json` es `["**", "!**/*.json", …]` y el `!**/*.json`
  no es cosmético.** Sin él, ampliar el gate de `**/src/**/*` a todo el paquete
  arrastra 279 líneas de reformateo en cinco JSON que escapan de dos clases con
  la misma consecuencia:
  - **Los que escribe una herramienta**: `.cta.json` (create-t3-app),
    `components.json` (shadcn), `tsr.config.json` (TanStack Router). Es el mismo
    motivo por el que `routeTree.gen.ts` está excluido: no es "porque es
    generado", es "porque reescribirlo es churn que un generador deshace".
  - **Los que son configuración cuyo espacio es irrelevante**: `package.json`,
    `tsconfig.json`, `biome.json` y `.vscode/settings.json`. No los lee ni un
    humano ni una herramienta como código, y reformatearlos a tabuladores no
    cambia nada salvo el diff.

  Lo que se pierde con la exclusión es SOLO el formato: `biome lint` sobre un
  JSON pasa igual, y un JSON **malformado** sigue rompiendo a quien lo consume
  —con `tsconfig.json` roto, `bun run typecheck` sale con 2—. O sea que el
  gate de formato solo detectaba ruido ahí.

  Si algún día un JSON pasa a ser código que uno escribe, **no saques la
  exclusión**: agregá una excepción puntual con `!` sobre ese path. Medido:
  `["**"]` con los JSON en su estado previo da 6 errores de `format`; con la
  exclusión, 400 archivos y verde. Lo que `**` sí trae y hay que mantener es
  `e2e/` (10 archivos), `test-preload.ts`, `playwright.config.ts` y `public/`
  — los primeros dos estaban fuera de todo gate y por eso el formatter no
  veía ni las comillas simples de `test-preload.ts` ni los specs de e2e.
