# Role API — Agent Guide (NestJS)

Guía de agente de `apps/api`, alineada al ecosistema NestJS. La raíz del monorepo (`AGENTS.md`) define las reglas globales.

## Rol en el ecosistema

BFF de **admin/landing**: posee las reglas de negocio (stock, ciclo de órdenes, pagos futuros). **El móvil NO pasa por esta API** — consume Supabase directo. Supabase sigue siendo la fuente de verdad de schema Postgres y Auth (RLS como frontera).

## Stack

- **NestJS 11** (Express), builder SWC
- **Drizzle ORM** + `postgres` (Supabase pooler, `prepare: false`)
- **Supabase Auth** JWT verification (`jose`) — guards por rol
- **Zod** validation + tipos compartidos de `@0xc1x/role-commons` (`workspace:*`)
- **@nestjs/swagger** + **Scalar** UI en `/docs`
- **Helmet** + **Throttler** (hardening)

## Estructura

```
src/
├── modules/<dominio>/   # controllers / services / mappers
├── database/schema/     # schema drizzle
├── common/              # pipes, filters, decorators
├── auth/ + modules/auth # guards por rol
```

## Convenciones

- **Mappers por módulo** (dominio ↔ DTO): nunca expongas filas de DB crudas por la API.
- **Guards por rol** en rutas protegidas; validación con zod en fronteras.
- **Alinear drizzle schema ↔ schemas zod de commons**: `bun run typecheck` en la raíz es el guard principal.
- **OpenAPI**: `bun run openapi:export` regenera `openapi/` (consumido por Scalar).

## Comandos

```sh
bun run start:dev      # NestJS watch (SWC)
bun run test           # jest
bun run test:e2e       # jest e2e
bun run typecheck      # tsc --noEmit
bun run openapi:export # regenerar openapi/
bun run db:studio      # drizzle studio
bun run db:pull        # introspect (revisar antes de sobrescribir)
```

## Verificación antes de declarar done

```sh
bun run typecheck && bun run test
```

## Deuda y estado conocido

- Roadmap activo (espejo Supabase → API): `docs/roadmap-api-mirror.md` (ADR-0008).
- Backlog histórico pre-monorepo: `IMPROVEMENT_PLAN.md` (archivado — muchos ítems ya aplicados o obsoletos).
