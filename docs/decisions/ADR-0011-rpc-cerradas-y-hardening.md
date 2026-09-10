# ADR-0011: Superficies cerradas por diseño y hardening de RPCs DEFINER

- **Estado**: Aceptado
- **Fecha**: 2026-09-06

## Contexto

Los advisors de seguridad de Supabase reportaban tres familias de hallazgos:

1. **`app_store` y `push_sends` con RLS habilitado y cero policies** (lint 0008, INFO).
2. **RPCs `SECURITY DEFINER` ejecutables por `anon`** (lint 0028): `reserve_offer`,
   `cancel_order`, `validate_pickup_code`, `get_platform_stats`,
   `generate_payouts`, `accrue_order_earnings`, `notify_business_*`.
   `SECURITY DEFINER` corre con privilegios del dueño y **omite RLS**, así que
   el execute público era superficie real de ataque.
3. **Binding de identidad ausente**: `reserve_offer` confiaba del parámetro
   `p_user_id` (cualquier caller podía reservar a nombre de otro usuario,
   decrementar stock y quemar cupones) y la ruta consumidor de `cancel_order`
   comparaba contra el parámetro, no contra `auth.uid()` (un autenticado podía
   cancelar pedidos ajenos pasando el `user_id` de la víctima).
4. `sync_business_verification` con `search_path` mutable (lint 0011).

Verificación de consumidores (2026-09-06): las RPCs client-facing solo las
llama `apps/mobile` autenticado; `generate_payouts` es función de cron
(pg_cron corre como dueño); `accrue_order_earnings`, `notify_business_*` y
`sync_business_verification` son funciones de trigger (el disparo no requiere
grants); `app_store`/`push_sends` no tienen ningún lector PostgREST (solo el
schema drizzle de `apps/api`, que accede con service role bypaseando RLS).

## Decisión

1. **`app_store` y `push_sends` permanecen deny-all** (RLS sin policies).
   Es la postura más segura posible para tablas internas: inaccesibles desde
   cualquier cliente PostgREST. Se documentan como cerradas a propósito y el
   advisor INFO se acepta. Si algún día un cliente necesita leerlas, se añaden
   policies explícitas en ese momento — no antes.
2. **Grants mínimos por tipo de RPC** (migración `harden_rpc_grants`):
   - Client-facing (llamadas desde mobile autenticado): `revoke from public, anon`
     + `grant to authenticated` — `reserve_offer`, `cancel_order`,
     `validate_pickup_code`, `get_platform_stats`, `set_order_status`.
   - Solo triggers/cron: revocados también para `authenticated` —
     `accrue_order_earnings`, `notify_business_pending`,
     `notify_business_verification`, `generate_payouts`,
     `sync_business_verification`.
   - Toda RPC nueva en `public` debe nacer con este patrón de grants
     (y quedar `anon=false` salvo decisión explícita documentada).
3. **Binding de identidad dentro de las RPCs de orden** (migración
   `bind_order_rpc_identity`): `reserve_offer` exige `p_user_id = auth.uid()`
   y la ruta consumidor de `cancel_order` ídem. El guard es condicional a
   `auth.uid() IS NOT NULL` para que `service_role` (flujos internos futuros)
   siga operativo. Firmas intactas: cero cambios de cliente.
4. **RPCs client-facing `SECURITY DEFINER` son aceptadas** con el advisor
   0029 en WARN: su riesgo queda mitigado por el binding interno y la matriz
   server-side, no por el tipo de función. Convertirlas a `SECURITY INVOKER`
   exigiría replicar políticas RLS de escritura que hoy viven dentro de las
   funciones — costo mayor que el beneficio.

## Consecuencias

- El advisor 0028 (anon) queda en cero; el 0029 restante es la lista cerrada
  de 5 RPCs client-facing aceptadas.
- Cualquier flujo futuro de admin que necesite actuar en nombre de un usuario
  debe ir por `service_role` (uid null) o por RPCs con validación de owner.
- Leaked password protection se gestiona desde el Dashboard de Auth (no es
  SQL) y se trackea aparte.
