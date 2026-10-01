# Deuda de seguridad abierta antes de recibir clientes

Fecha: 2026-09-25. Ordenada por lo que bloquea el lanzamiento.
Revisado contra la base de datos el 2026-09-25 (SQL directo, no inferencia).

> **Cómo se verificó esta revisión.** Cada afirmación de estado de abajo se
> comprobó con `has_column_privilege` / `information_schema` /
> `supabase_migrations.schema_migrations` sobre la base real. `has_table_privilege`
> **no sirve** para concluir que falta un privilegio: este esquema usa grants
> **por columna** a propósito, así que a nivel de tabla devuelve `false`
> aunque la escritura exista columna por columna. Y `has_column_privilege`
> necesita **4** argumentos (`user, tabla, columna, privilegio`); con 3 Postgres
> interpreta el rol como nombre de tabla y responde `42P01`.

## 0. Una migración aplicada sin pasar por el ledger (corregido)

**Estado:** cerrado el 2026-09-25.

`businesses_client_write_grants` restauraba los grants de escritura que
`20260925163235` había quitado con `revoke all`. El SQL se ejecutó directo: los
efectos están en la base (los grants por columna y los triggers
`trg_set_business_owner_from_jwt` y `trg_default_business_inactive`), pero el
ledger no tenía la fila, así que el directorio de migraciones no describía la
base y `supabase db push` la habría reproducido contra un proyecto vivo como si
nunca hubiera corrido.

Re-aplicada por `apply_migration` (idempotente) y registrada como
`20260926010336_businesses_client_write_grants`; el `md5sum` del archivo coincide
con `md5(statements[1])` del ledger. La regla que lo previene está en
`AGENTS.md` y en `supabase/migrations/README.md`.

**El fallo no fue el SQL, fue escribir a la base por una vía que no deja
rastro y luego confundir un commit con prueba de aplicación.**

## 1. Columnas de negocio expuestas a `anon` (P1-2, cerrada 2026-10-01)

**Estado:** cerrado. La fase 3 se aplicó (`20260927025753`, ledger) y
`public.businesses` contiene solo 16 columnas públicas — verificado por SQL el
2026-10-01: sin `commission_rate`, `balance`, `verification_status`,
`verified_at`, `verified_by`, `rejection_reason` ni `owner_id`. Las tablas
acompañantes (16/16/16, sin huérfanos) no tienen grants a `anon`.

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

## 1b. Fase 3 del split de `businesses`: aplicada 2026-10-01

**Estado:** fases 1, 2 y 3 aplicadas. La 3 consta en el ledger como
`20260927025753_businesses_drop_sensitive_columns.sql` (archivo byte-idéntico,
md5 `31607cd0…`). La base está en **fase 3**; falta **desplegar la API fase 2**,
cuyo código ya lee/escribe las acompañantes — hasta ese deploy, el servicio
desplegado (fase 1) no puede operar contra la base. Desplegar cuanto antes.

- **Fase 1 — hecha.** Las tres tablas acompañantes existen y están backfilled
  (16/16, 0 discrepancias). Aditiva: no cambió nada que la app use.
- **Fase 2 — hecha, sin desplegar.** API y mobile leen y escriben las tablas
  acompañantes. El DTO público no cambia. El cliente móvil ya no envía
  `owner_id`: la propiedad se deriva de `auth.uid()`, así que ya no puede
  escribirse.
- **Fase 3 — aplicada 2026-10-01** (`20260927025753`, md5 verificado contra el
  ledger). `reserve_offer` reescrito a `business_finance`, predicados de
  ownership a `business_ownership` (verificado en `pg_get_functiondef`).

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
2. Aplicar `20260927025753_businesses_drop_sensitive_columns.sql`.

Ese orden está escrito en la cabecera de la migración, y hay un test que falla
si alguien la borra.

**Drift adicional detectado:** `apps/api/src/database/schema/businesses.ts`
declaraba `owner_id` con `onDelete: 'no action'`, pero la FK real en la base es
`ON DELETE CASCADE`. El schema Drizzle está desalineado de la base;
`business_ownership` sigue la base, que es lo correcto. Corregir en la fase 3.

## 2. Doce de doce migraciones byte-idénticas al ledger (cerrado 2026-10-01)

**Estado:** cerrado. Reproducibilidad, no correctitud.

Las doce migraciones `20260925*` son ahora byte-idénticas a lo que la base
recibió (`md5sum` == `md5(statements[1])` por archivo, commit `8726f12`).
Reconstruir un entorno desde `supabase/migrations/` reproduce la cadena aplicada.

Detalle e historial de la divergencia en `supabase/migrations/README.md`.

## 3. Seis migraciones ausentes del repo

**Estado:** deliberado, documentado.

Cinco migraciones contienen el JWT real de la anon key y una contiene hashes
bcrypt de usuarios seed. El repositorio es público, así que commitearlas
publicaría la credencial de forma permanente. Sus sustitutos actuales están en
las migraciones `20260925163235` en adelante. Para una auditoría, leerlas del
ledger; el procedimiento está en `supabase/migrations/README.md`.

## 4. Lint sin cubrir en mobile y commons

**Estado:** cerrado el 2026-10-01. Verificado el 2026-09-25, cubierto después.

`bun run lint` corre en admin, landing y api, y ahora también en
`apps/mobile` (`biome lint . --error-on-warnings`) y `packages/commons`
(`biome lint .`). Verificado el 2026-10-01: ambos corren en limpio
(`Checked 377 files` / `Checked 197 files`, sin hallazgos), así que los ~30
hallazgos mecánicos originales (`noUnusedImports`, `useImportType`, prefijo
`node:`, `noNonNullAssertion`) ya están resueltos o acotados donde viven.

Lo que sí está cubierto desde `80698b2` es el **formateo** (`format:check` con
biome, en turbo y en CI). Formateo no es lint: el formateador no reporta
`noUnusedImports` ni `useImportType`. Los dos scripts son independientes.

## 5. Verificación que no se puede hacer desde el código

**Estado:** abierto, pero menos vacío que antes.

Toda la evidencia de la remediación de seguridad es de capa Postgres: matriz
de roles con mutaciones reales y round-trips por PostgREST. Sobre la capa de UI
hay ahora una **auditoría estática de 63 hallazgos** (31 en mobile, 32 en
landing + admin) que Camilla no encontró, no recorrió ni midió.

Lo que sigue sin verificarse, y no se puede verificar leyendo código:

- Recorrer en un dispositivo real el camino de **crear una oferta y editar una**.
  Sigue siendo el camino que nunca se recorrió.
- Confirmación de correo: **parcial.** `businesses.service.ts:117-122` crea
  el usuario con `email_confirm: false` vía `auth.admin.createUser`, que
  **no envía ningún correo**, pero `sendConfirmationEmail` ya existe
  (`businesses.service.ts:202-277`): genera el enlace con
  `auth.admin.generateLink({ type: 'signup' })` y lo entrega por Resend en modo
  best-effort. Lo que falta es **verificar la entrega en staging** (el envío
  depende de un dominio verificado en Resend y de `RESEND_API_KEY`). La
  pantalla de registro promete "Recibirás un email para confirmar tu cuenta"
  (`apps/landing/src/routes/business-signup.tsx:311-314`), y el admin sí
  muestra el email y el teléfono del solicitante antes de aprobar
  (`businesses.columns.tsx:40,51`). Si el correo no llega, la cuenta queda sin
  poder activarse (`Email not confirmed` al login): no aprobar en prod hasta
  ver un `business_confirmation_email_sent` real en los logs.
- Contraste y dynamic type: los ratios de los hallazgos se calcularon a mano
  desde los hex de `colors.ts`, no contra píxeles renderizados.

## 6. Acciones de configuración externas

Identidad legal y RUC, bundle ID final, `VITE_SITE_URL`, GitHub production
environment, secrets de Render/Vercel (`REDIS_URL`, `APP_VERSION`,
`RENDER_GIT_COMMIT`), protección de contraseñas filtradas en Supabase, y
Turnstile cuando exista frontend y verificación server-side.
