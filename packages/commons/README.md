# @0xc1x/role-commons (`packages/commons`)

Fuente de verdad de contratos del ecosistema Rolé: DTOs, schemas Zod, enums y entidades por dominio.

Consumido por `api`, `admin`, `landing` y `mobile` vía `workspace:*` — no se publica al registry.

## Comandos

Desde la raíz del monorepo:

```bash
bun run build --filter=@0xc1x/role-commons   # tsc + fix-imports → dist/
bun run typecheck                             # valida commons + todos los consumidores
```

Desde este directorio:

```bash
bun run build        # tsc + scripts/fix-imports.mjs
bun run test         # vitest
bun run docs:export  # openapi.json desde schemas
```

## Estructura

```
src/
├── <dominio>/{schemas,dtos,enums,entities}/
└── _common/    # enums y schemas transversales
```

## Guía de agente

Ver [AGENTS.md](./AGENTS.md) y [../../docs/contracts.md](../../docs/contracts.md).
