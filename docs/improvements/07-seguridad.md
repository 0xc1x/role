# 07 — Seguridad (sin secrets, proyecciones mínimas, RLS)

**Estado: aplicado en mobile y landing.**

## Problema en el original

- Riesgo de secrets inline (los keys anon de Supabase viajan en el bundle igual,
  pero el riesgo real era config sin validar y queries que devolvían más columnas
  de las necesarias).
- Queries `select *` amplias a través de RPC/rest.
- Sin sanitización de entrada en la frontera móvil (formularios confiaban en la DB).

## Solución aplicada

1. **Sin secrets**: solo `EXPO_PUBLIC_*` (públicos por diseño) en `.env`;
   `.env*` ignorado. Nada de tokens de servicio en clientes.
2. **Proyecciones PostgREST explícitas y mínimas**:
   - `OFFER_SELECT` selecciona solo las columnas que la UI necesita y embebe
     `business`, `business_locations`, `offer_categories` con el menor shape.
   - Los tipos de esas proyecciones son `Pick<>` sobre los tipos de commons
     (ver [01-tipado-y-contratos.md](./01-tipado-y-contratos.md)).
3. **RPCs para transacciones** (`reserve_offer`, `cancel_order`,
   `validate_pickup_code`) — la lógica de stock y validación vive en la DB con RLS,
   no en el cliente (ADR-0002).
4. **Validación en frontera**: Zod en env y en los pocos inputs libres
   (código de cupón, formularios) — nunca se confía en el cliente.

## Frontera de datos

- El móvil usa el client anon + sesión del usuario: RLS filtra filas por rol
  (consumidor ve negocios `active`, negocio ve solo lo suyo). La API es BFF de
  admin/landing, NO del móvil (ADR-0002).

## Pendiente de decisión

- **Tri-state de negocio** (`pending/active/rejected`): documentado en README raíz.
  La landing inserta negocios `is_active=false` para verificación manual; el móvil
  los oculta por RLS. Cuando exista `pending/rejected`, actualizar RLS + filtros
  del móvil.
