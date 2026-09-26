# Deuda de seguridad abierta antes de recibir clientes

Fecha: 2026-09-25. Ordenada por lo que bloquea el lanzamiento.

## 1. Columnas de negocio expuestas a `anon` (P1-2, revertido a propósito)

**Estado:** abierto. Las ofertas vuelven a cargar, el precio es exposición de datos.

`public.businesses` tiene 7 columnas que no deberían ser públicas:
`commission_rate`, `balance`, `verification_status`, `verified_at`,
`verified_by`, `rejection_reason`, `owner_id`.

El 2026-09-25 se intentó ocultarlas reemplazando el SELECT de tabla con grants
por columna. **Es incompatible con PostgREST**: `offers`, `business_locations` y
`orders` tienen FK a `businesses`, y PostgREST necesita SELECT a nivel de tabla
sobre una tabla referenciada para resolver relaciones. Toda lectura por
`/rest/v1/offers` fallaba con `42501 permission denied for table businesses`,
incluido `select=id` sin embed. El catálogo de ofertas, que es el producto, no
cargaba.

Los grants por columna y las relaciones de PostgREST son mutuamente excluyentes.
Solo hay dos salidas: exponer la tabla, o mover las columnas fuera de ella.

**Follow-up requerido:** mover esas columnas a tablas acompañantes
(`business_finance`, `business_moderation`) para que `businesses` solo contenga
datos públicos y el SELECT de tabla vuelva a ser seguro. Alcance: schema
Drizzle, repositorio y mappers de negocios en la API, queries de admin, triggers
`enforce_offer_business_availability` y `sync_business_verification`,
`reserve_offer`, generación de payouts y sus tests.

El RLS sigue acotando filas: `anon` solo ve negocios activos. Lo que se expone
son columnas de un negocio activo, no filas inactivas.

**La exposición está fijada por un test** a propósito, en
`apps/api/src/database/security/public-read-grants.spec.ts`
("businesses: table-level SELECT is restored, and the exposure it buys is
named"). Cuando las columnas se muevan, ese test se reemplaza por uno que
pruebe que ya no están en la tabla. No lo borres sin hacer el follow-up: el test
existe para que la deuda sea visible y no se olvide en silencio.

## 1b. Fase 3 del split de `businesses`: verificada, pendiente de deploy

**Estado:** fases 1, 2 y 3 escritas. La 3 NO aplicada — depende de un deploy.

- **Fase 1 — hecha.** Las tres tablas acompañantes existen y están backfilled
  (16/16, 0 discrepancias). Aditiva: no cambió nada que la app use.
- **Fase 2 — hecha, sin desplegar.** API y mobile leen y escriben las tablas
  acompañantes. El DTO público no cambia. El cliente móvil ya no envía
  `owner_id`: la propiedad se deriva de `auth.uid()`, así que ya no puede
  escribirse.
- **Fase 3 — escrita y verificada, NO aplicada.**
  `supabase/migrations/20260926000011_businesses_drop_sensitive_columns.sql`.

### Alcance real (tres estimaciones fallidas, en orden)

| Estimación | Realidad | Cómo se descubrió |
| --- | --- | --- |
| 2 funciones | 10 funciones | escaneo de `pg_proc.prosrc` |
| 3 políticas | **20 políticas** | `drop column` las listó todas |
| — | 2 triggers a mudarse de tabla | lectura de `pg_get_triggerdef` |

**17 de esas 20 políticas viven en otras 11 tablas**: `offers` (4),
`business_notification_preferences` (3), `offer_categories` (2),
`business_hours`, `business_locations`, `coupons`, `payouts`, `orders`,
`order_events`, `payment_intents` y `profiles`.

Esto no es un dato menor. `DROP COLUMN ... CASCADE` — que es lo que escribe
cualquiera con prisa — habría **borrado 17 políticas de seguridad en silencio**
a través de 11 tablas. Una política tipo "Owners can update own offers" que
desaparece no es un aviso, es una puerta abierta. Postgres rechaza el `drop`
sin `CASCADE`, y esa es la única razón por la que se detectó.

### Cómo se verificó

Contra la base de desarrollo, dentro de una transacción que se autoboca
(`RAISE EXCEPTION` al final): 10 funciones reescritas, 20 políticas recreadas,
las 7 columnas dropeadas **sin `CASCADE`**, un negocio creado por el bootstrap,
aprobado, rechazado, y el trigger de disponibilidad de ofertas ejercitado. El
ciclo de vida completo de un pedido (reserva → confirmación → lista → código de
recogida → completada → payout) se corrió por separado contra las mismas
reescrituras: fee 0.40, net 3.60, `business_finance.balance` 3.60 mientras
`businesses.balance` quedaba intacto, y payout a 0.00 tras el recálculo.

El archivo del disco se aplicó además con `psql` + `rollback` contra la base
real: **exit 0**. Cero residuo verificado después (17 políticas de nuevo,
`owner_id` presente, 0 funciones reescritas, 36 pedidos, stock 4).

### Tres cosas que la lectura del diff no avisa

1. **El trigger bootstrap tiene que ser AFTER INSERT.** Las acompañantes tienen
   FK a `businesses(id)` y se validan en el acto, así que un trigger BEFORE
   falla 23503. Solo aparece al ejecutar el insert.
2. **El coste de AFTER es que la política de inserción ya no puede exigir la fila
   de propiedad.** Eso no debilita nada: la base asigna `owner_id` desde
   `auth.uid()`, así que "solo creas negocios que te pertenecen" deja de ser una
   cláusula que el cliente cumple y pasa a ser algo que no puede expresar.
3. **`sync_business_verification` se parte en dos.** BEFORE fija `verified_at`
   (un AFTER no puede modificar `NEW`); AFTER propaga `is_active` a
   `businesses`, que es otra tabla. Y `notify_business_pending` se queda
   deliberadamente en `businesses`: si se mudara a la acompañante, dispararía
   desde dentro del bootstrap, cuando la fila del negocio aún no es legible.

### Por qué las funciones se reescriben y no se reescriben a mano

`reserve_offer`, `generate_payouts`, `set_order_status`, `cancel_order`,
`validate_pickup_code` y `active_offers_near` mueven plata y órdenes. La
migración no pega su cuerpo: toma `pg_get_functiondef(oid)` y sustituye **una
predicada**. Así cada línea no auditada de una función auditada se preserva byte
a byte, y si alguien editó esa función después, la migración **falla** en vez
de hacer un no-op silencioso que deje una función leyendo una columna que ya no
existe.

### Orden de aplicación

1. Desplegar la API de la fase 2. **El servicio actual lee columnas que caerán.**
2. Aplicar `20260926000011`.

Ese orden está escrito en la cabecera de la migración, y hay un test que falla
si alguien la borra.

**Drift adicional detectado:** `apps/api/src/database/schema/businesses.ts`
declaraba `owner_id` con `onDelete: 'no action'`, pero la FK real en la base es
`ON DELETE CASCADE`. El schema Drizzle está desalineado de la base;
`business_ownership` sigue la base, que es lo correcto. Corregir en la fase 3.

## 2. Ocho migraciones nunca se han ejecutado

**Estado:** abierto. Reproducibilidad, noorrectitud.

De las nueve migraciones `20260925*`, ocho no son byte-idénticas a lo que la base
recibió. Son las versiones revisadas y documentadas; la base recibió SQL
equivalente enviado por MCP. Solo `20260925165931_offer_stock_write_grant.sql`
coincide.

Las versiones del repo **nunca se han ejecutado**: son equivalentes por
razonamiento, no por prueba. Antes de confiar en `supabase/migrations/` para
reconstruir un entorno, reproducir la cadena en una rama desechable de Supabase
y dejar que la base juzgue.

Detalle en `supabase/migrations/README.md`.

## 3. Seis migraciones ausentes del repo

**Estado:** deliberado, documentado.

Cinco migraciones contienen el JWT real de la anon key y una contiene hashes
bcrypt de usuarios seed. El repositorio es público, así que commitearlas
publicaría la credencial de forma permanente. Sus sustitutos actuales están en
las migraciones `20260925163235` en adelante. Para una auditoría, leerlas del
ledger; el procedimiento está en `supabase/migrations/README.md`.

## 4. Lint sin cubrir en mobile y commons

**Estado:** abierto, cosmético.

`bun run lint` corre en admin, landing y api. `apps/mobile` y `packages/commons`
no tienen script de `lint`, así que ~30 hallazgos de biome no bloquean nada.
La mayoría son mecánicos (`noUnusedImports`, `useImportType`, prefijo `node:`);
`noNonNullAssertion` (7) cambia tipado y conviene revisar aparte.

## 5. Verificación que no se puede hacer desde el código

**Estado:** abierto.

Toda la evidencia de esta remediación es de capa Postgres: matriz de roles con
mutaciones reales, y round-trips por PostgREST. La capa de UI no está verificada.
Antes de recibir clientes hay que abrir la app y, como comercio, **crear una
oferta y editar una**. Ese camino se recorrió cero veces.

## 6. Acciones de configuración externas

Identidad legal y RUC, bundle ID final, `VITE_SITE_URL`, GitHub production
environment, secrets de Render/Vercel (`REDIS_URL`, `APP_VERSION`,
`RENDER_GIT_COMMIT`), protección de contraseñas filtradas en Supabase, y
Turnstile cuando exista frontend y verificación server-side.
