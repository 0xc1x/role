# Operación, incidentes y recuperación

Esta runbook cubre los controles que no pueden demostrarse solo con el código. No contiene valores de secretos y no autoriza cambios directos en producción.

## Salud y observación

### API

`GET /api/v1/health` es un readiness check. Devuelve `503` si falla Postgres, Redis de rate limiting o si producción quedó con almacenamiento de throttling en memoria.

| Campo | Interpretación |
| --- | --- |
| `version` | SHA desplegado; debe coincidir con GitHub/Vercel/Render |
| `database` | `up` solo después de `select 1` |
| `rateLimit.backend` | `redis` en producción |
| `jobs.ordersExpiration.enabled` | Debe ser `true` en producción |

La API registra eventos estructurados con nombre, tipo y código de error. No registra mensajes/stacks/causes crudos, query strings ni tokens de dispositivos.

### Frontends y PWA

- Mobile ya tiene Sentry nativo/web condicionado por consentimiento y DSN.
- Admin y landing no tienen dependencia Sentry configurada. No se instala una integração especulativa.
- Si se integra Sentry, agrega la dependencia del workspace, inicialización con release/SHA, muestreo, PII scrubbing y pruebas de consentimiento antes de producción.

## Expiración de órdenes

No existe trigger ni job `pg_cron` de expiración de órdenes en el SQL inspeccionado. Sí existen otros jobs de plataforma, pero ninguno cubre ese ciclo. El job NestJS cada 60 segundos es el expirador durable mientras Render permanezca activo.

Invariantes:

- `ENABLE_JOBS_ORDERS_EXPIRATION=true` en `render.yaml`;
- `validateEnv` rechaza producción sin el flag;
- `/health` muestra el flag;
- el servicio usa transacción para expirar y restaurar stock;
- más de una instancia Render puede ejecutar ticks, pero la operación de base de datos debe seguir siendo idempotente.

Si el job falla, busca el evento `orders_expiration_failed` por `errorType`/`errorCode` y usa `requestId` o una ventana temporal. No copies payloads ni credenciales a un ticket.

## Rate limiting y abuso

### Implementado

- Límite global: 100/minuto.
- Endpoints auth/orders/upload/contact mantienen límites menores.
- Contact: 5/minuto; onboarding de negocios: 3/minuto.
- Redis es obligatorio en producción.
- Las claves Redis se almacenan como hash SHA-256; no contienen IP ni tracker en claro.
- Sin `REDIS_URL`, desarrollo usa un fallback en memoria y health lo declara.

### Pendiente externo

- Redis gestionado, TLS, backups y alarms son settings del operador.
- Cloudflare Turnstile no está conectado. `TURNSTILE_*` es configuración reservada; habilitarlo sin verificador frontend/API no agrega protección y puede dar una falsa sensación de seguridad.
- Para activar Turnstile se requiere token en landing, verificación server-side, expected hostname/action, pruebas y política de fail-closed.

### Deduplicación de contactos

`app_store` tiene `namespace`, `key` y `value`, pero no tiene una constraint única para deduplicar leads. El servicio inserta cada solicitud; no se finge idempotencia. Para deduplicación durable se requiere decidir una clave canónica y añadir una constraint/índice único con migración revisada.

Onboarding de negocios ya usa el email como identidad de Auth; conserva esa restricción existente y no introduzcas otro contrato de lead.

## Rotación de secretos

Los componentes prepared/leídos usan variables de entorno. No imprimas valores durante la rotación.

### Procedimiento

1. Inventariar consumidores: Render, Supabase Edge Functions, webhooks/triggers de base de datos y Vercel.
2. Generar el reemplazo en el secret manager de la organización.
3. Actualizar primero el consumidor que verifica y después el que envía, usando una ventana de solapamiento si el proveedor lo permite.
4. Para `INTERNAL_SECRET`, actualizar **solo** el valor en Vault (`vault.secrets`, nombre `internal_secret`). La base es la única fuente de verdad: las funciones Edge verifican el secreto llamando a `public.internal_dispatch_secret_matches()`, y los disparadores SQL leen el valor de Vault al despachar. No hay nada que actualizar en el código ni en el entorno de las funciones, y ninguna ventana de solapamiento es necesaria.
5. Verificar una invocación interna autorizada y una no autorizada.
6. Revocar el valor anterior y confirmar que las funciones_edge_logs ya no lo contienen.
7. Rota por separado las credenciales con mayor alcance: service role, FCM, Resend, Supabase JWT y tokens de Vercel/Render.

No rotes ni imprimas secretos desde este repositorio. La exposición histórica requiere que un operador autorizado haga la rotación y limpie logs/retención según la política del proveedor.

## Incidente: API o web no disponible

1. Identifica el SHA con `/health`, Render y Vercel.
2. Determina si falla DB, Redis, Vercel promotion o smoke externo.
3. Si es un deploy, usa el rollback de `docs/deploy.md`.
4. Si Redis está caído, no cambies a memoria en producción para “restaurar” tráfico: restaura Redis o revierte la configuración.
5. Si falla DB, restaura conectividad/secretos mediante el proveedor; no ejecutes DDL ad hoc.
6. Confirma orders, contact, onboarding y push con requests sintéticos que no contengan PII real.

## Restauración de base de datos

1. Crea o confirma una rama Supabase de desarrollo; nunca restaures producción como primer paso.
2. Usa el mecanismo de PITR/backup soportado por Supabase y registra el timestamp objetivo.
3. Aplica el historial de migraciones de `supabase/migrations` en orden.
4. Ejecuta typecheck/tests y validaciones de Advisors, RLS, funciones y storage.
5. Valida Pedidos, stock, profiles, consentimientos y notificaciones con datos sintéticos.
6. Solo después de revisión, ejecuta el restore/promoción planificado por el operador.

No existe rollback automático de datos en este workflow. Un migration SQL con índices/políticas debe incluir notas de rollback y probarse primero en una rama Supabase.

## Migraciones

- No aplicar migraciones desde el deploy workflow.
- Los archivos se versionan en `supabase/migrations`.
- Una migración debe fijar `search_path`, ser idempotente cuando sea posible y documentar cómo revertir cada cambio.
- Los cambios de políticas no se consolidan en masa; solo cuando la equivalencia esté probada.

## Checklist de cierre de incidente

- [ ] SHA y versión verificados
- [ ] Redis/readiness operativo
- [ ] expiración de órdenes activa
- [ ] sitios web y PWA servidos
- [ ] logs no contienen tokens, mensajes crudos o query strings
- [ ] secretos rotados y antiguos revocados
- [ ] restore/rollback probado en desarrollo
- [ ] seguimiento operador creado sin datos sensibles
