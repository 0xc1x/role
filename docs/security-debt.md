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
