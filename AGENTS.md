# Rolé Monorepo — Operating Guide

Monorepo bun workspaces + Turborepo para el ecosistema **Rolé**: marketplace de comida excedente (estilo Too Good To Go) con superficies móvil (Expo), landing (TanStack Start), admin (TanStack Start) y API (NestJS), con contratos compartidos en `packages/commons`.

## Contexto obligatorio — lee por tarea, no leas todo

| Tipo de tarea | Lectura mínima |
|---|---|
| Cualquiera | Este archivo + `README.md` (mapa/quickstart) + `docs/architecture.md` |
| Cambios en contratos | `packages/commons/AGENTS.md` + `docs/contracts.md` |
| Trabajo en API | `apps/api/AGENTS.md` + `packages/commons` |
| Trabajo en admin | `apps/admin/AGENTS.md` + `packages/commons` |
| Trabajo en landing/mobile | `apps/<app>/README.md` (la guía de agente llega con el scaffold) |
| Contexto de decisiones | `docs/decisions/` (ADR) |

## Estructura

```
role/
├── apps/
│   ├── api/          # NestJS 11 + drizzle — BFF de admin/landing
│   ├── admin/        # TanStack Start + shadcn — panel de administración
│   ├── landing/      # TanStack Start — marketing/SEO + onboarding business (scaffold pendiente)
│   └── mobile/       # Expo — port del app Flutter fudi (scaffold pendiente)
└── packages/
    └── commons/      # Contratos SSOT: DTOs, schemas Zod, enums, tipos
```

**Flutter (fudi) queda fuera del monorepo** como repo separado, congelado a features, hasta que `mobile` alcance paridad (estrategia strangler).

## Interrelación (grafo de dependencias)

```
                ┌─────────────┐
                │  Supabase   │  (fuente de verdad: schema Postgres + Auth + RLS)
                └──────┬──────┘
              directo  │  directo
        ┌──────────────┴───────────────┐
        ▼                              ▼
     apps/mobile                   apps/api (NestJS)
                                     ▲       │ HTTP
                                     │       ▼
        packages/commons ◄───── apps/admin ──┘
        (contratos, workspace:*)      │
                                     apps/landing
```

Reglas derivadas:

1. **`packages/commons` es la fuente de verdad de contratos.** Cambiarlo rompe en el compilador de TODOS los consumidores: `bun run typecheck` en la raíz valida el blast radius completo en un comando.
2. **`turbo` garantiza el build order**: commons antes que sus consumidores (`dependsOn ^build`).
3. **La API es BFF de admin/landing, NO intermediaria del móvil.** El móvil y la API consumen Supabase directo; RLS es la frontera de datos.
4. **Supabase** sigue siendo la fuente de verdad de schema y Auth; la **API** posee reglas de negocio (stock, ciclo de órdenes, pagos futuros).

## Reglas no negociables

- **Nunca agregues `Co-Authored-By` ni atribución de IA en commits.**
- Conventional commits.
- Nunca declares "done" si `bun run typecheck`, `bun run test` o `bun run build` fallan.
- Nada de builds de stores (EAS/App Store) en el flujo de desarrollo.
- Si hay ambigüedad crítica: **una** pregunta y detente.
- No asumas claims técnicos: verifica en código, docs o configuración.
- No crear nuevos paquetes en `packages/` sin consumidor real (un `commons` con carpetas de dominio adentro es suficiente; se divide solo si el grafo lo exige).

## Buenas prácticas profesionales (obligatorias)

- **PRs pequeños y atómicos.** El monorepo permite actualizar contrato + consumidores en el mismo PR — hazlo, no versiones intermedias.
- **Breaking changes en contratos**: actualizar TODOS los consumidores en el mismo PR (el compilador te dice dónde).
- **Tests por cambio de lógica**: vitest (admin), jest (api); test mínimo por feature nueva.
- **No sobre-ingeniería**: reutiliza los patrones existentes (resource module en admin, mappers en api, schemas zod en commons); cero abstracciones especulativas.
- **Seguridad por defecto**: nunca commitees secrets/env reales; valida input en fronteras (zod); RLS es la frontera de datos; no expongas filas de DB crudas por la API (usa mappers).

## Prioridad de decisión

Ante conflictos: 1. Seguridad y permisos · 2. Correctitud del negocio · 3. Operabilidad/observabilidad · 4. Accesibilidad · 5. Mantenibilidad arquitectónica · 6. Fidelidad visual.

## Verificación obligatoria

```sh
bun run typecheck   # turbo — incluye build de commons (d.ts para los consumidores)
bun run test        # turbo — vitest (admin) + jest (api)
bun run build       # turbo — commons → consumidores
```

Filtros turbo para trabajar acotado: `bun run typecheck --filter=api...` (solo el paquete y sus dependencias).

## MCPs preferidos (si configurados)

- `github` — PRs, issues, metadata
- `supabase` — inspección de Postgres/RLS

## Orquestación

Si el entorno soporta especialistas, enruta por bounded context: `backend` (api), `frontend` (admin/landing), `mobile` (expo), `contracts` (commons). Si no existen subagentes reales, simula su checklist antes de responder.
