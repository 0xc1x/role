# Deuda de seguridad

Fecha de la última revisión: **2026-10-05**. Verificada contra la base de datos
y el código el 2026-10-05 (SQL directo y lectura de código; nada inferido).

> **Qué cambió desde la revisión del 2026-09-25.** De los siete ítems que había,
> **cuatro están cerrados y uno estaba mal descrito**: la fase 3 del split de
> `businesses` sí se aplicó, y con ella el ítem §1, que era el P1 de la lista.
> Un agente que leyera la versión anterior habría tratado como abierta la
> exposición de columnas que ya no existe, y podía volver a aplicar una migración
> destructiva. Ese era el riesgo concreto de este documento.
>
> **Cómo se verificó.** `information_schema`, `pg_policies`, `pg_proc` y
> `supabase_migrations.schema_migrations` sobre la base real; `md5sum` de los
> archivos contra `md5(statements[1])` del ledger; lectura del código para lo que
> no es base de datos.
>
> Dos trampas de Postgres que este repo ya se encontró, y que conviene no
> repetir: `has_table_privilege` **no sirve** para concluir que falta un
> privilegio, porque este esquema usa grants **por columna** a propósito y a
> nivel de tabla devuelve `false` aunque la escritura exista columna por columna.
> Y `has_column_privilege` necesita **4** argumentos
> (`user, tabla, columna, privilegio`); con 3, Postgres interpreta el rol como
> nombre de tabla y responde `42P01`.

## Estado de los ítems

| # | Ítem | Estado 2026-09-25 | Estado 2026-10-05 |
| --- | --- | --- | --- |
| 0 | Migración fuera del ledger | cerrado | cerrado |
| 1 | Columnas de negocio expuestas a `anon` | **abierto (P1)** | **cerrado** — fase 3 aplicada |
| 1b | Split de `businesses`, fase 3 | "escrita, NO aplicada" | **aplicada** el 2026-09-27 |
| 2 | Ocho migraciones nunca ejecutadas | abierto | **cerrado** — 24/24 coinciden |
| 3 | Seis migraciones ausentes del repo | deliberado | deliberado (sin cambio) |
| 4 | Lint sin cubrir en mobile y commons | abierto | **cerrado** |
| 5 | Verificación no posible desde el código | abierto | parcial: correo de activación **cerrado** |
| 6 | Acciones de configuración externas | abierto | abierto (reducido) |
| 7 | Teléfono de soporte placeholder | — | **abierto, nuevo** |
| 8 | `app_config` con `role.ec` fuera del ledger | — | **abierto, nuevo** |

Lo único que queda abierto y bloquea el lanzamiento es **§6**. **§8** es el más
grave de los nuevos: el repo no puede reproducir la configuración de soporte de
producción, y una reparación sale de §7 y de §8 a la vez.

---

## 0. Una migración aplicada sin pasar por el ledger (cerrado)

**Estado:** cerrado el 2026-09-25. Sin cambio en esta revisión.

`businesses_client_write_grants` restauraba los grants de escritura que
`20260925163235` había quitado con `revoke all`. El SQL se ejecutó directo: los
efectos están en la base, pero el ledger no tenía la fila, así que el directorio
de migraciones no describía la base y `supabase db push` la habría reproducido
contra un proyecto vivo como si nunca hubiera corrido.

Re-aplicada por `apply_migration` (idempotente) y registrada como
`20260926010336_businesses_client_write_grants`; el `md5sum` del archivo coincide
con `md5(statements[1])` del ledger. La regla que lo previene está en
`AGENTS.md` y en `supabase/migrations/README.md`.

**El fallo no fue el SQL, fue escribir a la base por una vía que no deja rastro y
luego confundir un commit con prueba de aplicación.**

## 1. Columnas de negocio expuestas a `anon` (cerrado el 2026-09-27)

**Estado:** cerrado. **La versión anterior de este documento decía "abierto" y
eso era incorrecto.**

Era el P1 de la lista: `anon` podía leer `commission_rate`, `balance`,
`verification_status`, `verified_at`, `verified_by`, `rejection_reason` y
`owner_id` de **todo negocio activo**, porque restaurar el SELECT de tabla en
`businesses` era condición para que PostgREST resolviera las relaciones de
`offers`, `business_locations` y `orders`. Los grants por columna y las
relaciones de PostgREST son mutuamente excluyentes: la única salida era mover
las columnas fuera de la tabla.

Eso es lo que hizo el split en tres fases (`business_finance`,
`business_moderation`). **La fase 3 sí se aplicó**, con el nombre de ledger
`businesses_drop_sensitive_columns`.

> La versión anterior decía que la fase 3 estaba "escrita y verificada, NO
> aplicada", y que la última entrada del ledger era `20260926010336`. El motivo
> del error: la migración se llama `20260926000011_*` en el repo pero
> **`apply_migration` asigna la versión del servidor**, y el servidor le dio
> `20260927025753`. Buscar el número del nombre de archivo en el ledger no la
> encuentra. Toda migración aplicada tiene que buscarse **por `name`**, nunca por
> la versión del nombre de archivo.

### Verificado en la base el 2026-10-05

| Comprobación | Resultado |
| --- | --- |
| `businesses_drop_sensitive_columns` en el ledger | sí, `20260927025753` |
| Las 7 columnas sensibles en `businesses` | **0** |
| Columnas totales en `businesses` | 16, todas públicas |
| Tablas acompañantes | 2, `business_finance` y `business_moderation` |

Lista completa de `businesses` ahora: `id`, `name`, `type`, `slug`, `image`,
`cover_image`, `rating`, `review_count`, `description`, `phone`, `email`,
`website`, `is_active`, `created_at`, `updated_at`, `currency`.

El SELECT de tabla para `anon` sigue siendo necesario para las relaciones de
PostgREST, y ya no compra exposición: lo que hay en la tabla es lo que el
catálogo público puede mostrar.

### Acción pendiente que salió de este cierre

**El test que marcaba la deuda quedó viejo.** En
`apps/api/src/database/security/public-read-grants.spec.ts`, el caso
`businesses: table-level SELECT is required, and phase 3 must close what it
exposes` sigue afirmando que las columnas "are readable by anon" y dice en
comentario que esa aserción *"se quita solo cuando la fase 3 se haya aplicado de
verdad"*. Ya se aplicaron. El marcador está sonando por una puerta cerrada: el
test sigue verde porque las migraciones históricas del repo siguen en el
archivo, y va a seguirlo mientras estén.

Este documento lo pedía explícitamente: *"Cuando las columnas se muevan, ese test
se reemplaza por uno que pruebe que ya no están en la tabla."* **No lo
reemplazamos en esta revisión** porque es un cambio de código y no de
documentación, y porque borrar el marcador sin escribir el reemplazo quitaría la
trazabilidad de por qué el SELECT de tabla existe. Queda como el pendiente
concreo de este ítem.

## 1b. Split de `businesses`: qué se aplicó y qué queda

**Estado:** las tres fases aplicadas. Este ítem ya no describe deuda abierta;
se conserva porque el porqué de `20260927025753` es difícil de reconstruir.

- **Fase 1 — aplicada.** `business_finance` y `business_moderation` creadas y
  backfilled (16/16, 0 discrepancias). Aditiva.
- **Fase 2 — aplicada.** API y mobile leen y escriben las acompañantes. El DTO
  público no cambió. El móvil ya no envía `owner_id`: la propiedad se deriva de
  `auth.uid()`.
- **Fase 3 — aplicada el 2026-09-27** (`20260927025753`). Dropea las 7
  columnas, reescribe 10 funciones sustituyendo **una** predicada cada una
  (tomando `pg_get_functiondef` y preservando el resto byte a byte, para que si
  alguien editó la función después la migración falle en vez de hacer un no-op
  silencioso), y recrea 20 políticas.

### Lo que la lectura del diff no avisa, y sigue vigente

1. **El trigger bootstrap tiene que ser AFTER INSERT.** Las acompañantes tienen
   FK a `businesses(id)` y se validan en el acto, así que BEFORE falla 23503.
2. **El coste de AFTER es que la política de inserción ya no puede exigir la fila
   de propiedad.** Eso no debilita nada: la base asigna `owner_id` desde
   `auth.uid()`, así que "solo creas negocios que te pertenecen" pasa de ser una
   cláusula que cumple el cliente a algo que no puede expresar.
3. **`sync_business_verification` se parte en dos.** BEFORE fija `verified_at`
   (un AFTER no puede modificar `NEW`); AFTER propaga `is_active` a
   `businesses`. Y `notify_business_pending` se queda en `businesses` a
   propósito: si se mudara, dispararía desde dentro del bootstrap, cuando la fila
   del negocio aún no es legible.

### El drift que se detectó aquí, cerrado

La versión anterior decía que `apps/api/src/database/schema/businesses.ts`
declaraba `owner_id` con `onDelete: 'no action'` mientras la FK real es
`ON DELETE CASCADE`, y que se corrigiera en la fase 3. **Está cerrado por
eliminación:** la columna ya no existe y el archivo ya no declara ningún
`onDelete`. Verificado el 2026-10-05.

## 2. Ocho migraciones nunca se han ejecutado (cerrado)

**Estado:** cerrado. **La versión anterior decía "abierto" y ya no es cierto.**

Decía que de las nueve migraciones `20260925*`, ocho no eran byte-idénticas a lo
que la base recibió. Reconstruido el procedimiento del README y ejecutado el
2026-10-05: se extrajo `md5(statements[1])` del ledger para las **24**
migraciones de la ventana `20260925155153`–`20260927164628` y se comparó contra
`md5sum` de cada archivo del repo.

**24 de 24 coinciden.** Ninguna falla. Los archivos del repo se llaman con la
versión que asignó el servidor, que es el procedimiento correcto y ya no la
deuda que se describía.

Lo único que queda anotado: el README registra dos diferencias **deliberadas** entre
el archivo y una versión divergente del SQL — reformateo de one-liners en
`20260925155433` y espaciado de `verification_status = 'approved'` en
`20260925163235`. Ninguna cambia comportamiento y ninguna rompe el md5.

`bun run brand:check` falla hoy en `packages/commons/src/brand/icon.ts`, y
fallaba antes de esta revisión (verificado con `git stash`). No es de esta
documentación y no se tocó.

## 3. Seis migraciones ausentes del repo (deliberado, sin cambio)

Cinco contienen el JWT de la anon key y una contiene hashes bcrypt de usuarios
seed. El repositorio es público, así que commitearlas publicaría la credencial
de forma permanente e irreversible.

El JWT ya rotó fuera de la base durante el hardening de `20260925163235` y vive
solo en Vault, así que publicar esos archivos republicaría una credencial que ya
está muerta. Los hashes de las contraseñas seed son permanentes más allá de la
rotación.

La tabla con las seis, version por version, está en
`supabase/migrations/README.md`, junto con el procedimiento de restauración
segura. Para una auditoría, leerlas del ledger.

## 4. Lint sin cubierto en mobile y commons (cerrado)

**Estado:** cerrado. Verificado el 2026-10-05.

Decía que `apps/mobile` y `packages/commons` no tenían script de `lint`, así que
~30 hallazgos de biome no bloqueaban nada. Hoy los cinco paquetes tienen script:

| Paquete | `lint` |
| --- | --- |
| `apps/mobile` | `biome lint . --error-on-warnings` |
| `packages/commons` | `biome lint .` |
| `apps/api` | `eslint ... --fix` |
| `apps/admin` | `biome lint` |
| `apps/landing` | `biome lint` |

La raíz corre `turbo run lint`, y CI tiene un paso `Lint` **y** un paso `Format
check` separados, antes de los tests.

## 5. Verificación que no se puede hacer desde el código (parcial)

**Estado:** la mitad cerrada, el resto sigue siendo lo que es.

### Cerrado: el correo de activación

La versión anterior decía que `auth.admin.createUser` con `email_confirm: false`
no enviaba ningún correo, que el hook era un `// TODO`, y que el resultado era
una **cuenta que nunca podía activarse** con la pantalla de éxito prometiendo un
correo que no existía.

**Escrito y verificado el 2026-10-05.** `businesses.service.ts` tiene ahora
`sendConfirmationEmail`, que genera el enlace con
`auth.admin.generateLink({ type: 'signup' })` y lo entrega por Resend —mismo
cableado que `CampaignsService` y `ContactService`, no la cola de marketing— con
plantilla propia. `email_confirm: false` sigue en el `createUser`, pero ya no es
un bloqueo: es el estado correcto para un enlace de confirmación que se envía a
mano.

Es best-effort a propósito, y el comentario explica por qué: el usuario de auth
y la fila del negocio ya existen cuando se envía, así que un fallo de envío no
puede fallar el request. Lanzar convertiría una caída transitoria de correo en
un negocio bloqueado para siempre —el dueño reintenta, choca con "Email is
already registered" y nunca recibe el enlace—.

La segunda mitad de ese punto también está cerrada: el admin **sí** ve el email
y el teléfono del solicitante. `businesses` tiene `email` y `phone` como columnas
públicas desde el split, y el mapper de la API los expone.

Sin API key de Resend (dev y tests) el envío se omite y el onboarding continúa.

### Sigue abierto

- **Recorrer en un dispositivo real el camino de crear una oferta y editarla.**
  Sigue siendo el camino que nunca se recorrió, y no se puede recorrer leyendo
  código.
- **Contraste y dynamic type.** La auditoría estática de 63 hallazgos (31 en
  mobile, 32 en landing + admin) **no está en el repo** — no aparece en
  `docs/improvements/` ni en ningún otro documento, así que no se puede auditar
  ni reproducir. Sus ratios se calcularon a mano desde los hex de `colors.ts`,
  no contra píxeles renderizados. Conviene archivarla junto a los hallazgos que
  se cierren, o dejar de citarla.
- **La API de fase 2 nunca llegó a desplegarse por separado.** La base aplicó la
  fase 3 el 2026-09-27; no hay registro de en qué momento estaba desplegada la
  versión de la API que leía las acompañantes. Si ese orden se respetó, bien; si
  no, hubo una ventana en la que la API leía columnas que ya no existían. No se
  puede verificar desde el repo.

## 6. Acciones de configuración externas (abierto, lo que bloquea el lanzamiento)

**Estado:** abierto. Verificado el 2026-10-05 contra `app_config`.

Identidad legal del operador, que es lo que aparece en términos y privacidad, y
sigue con placeholders en la base:

| Clave | Valor en la base |
| --- | --- |
| `legal.company_name` | `Operador de Rolé (pendiente)` |
| `legal.controller_identity` | `el operador de Rolé (identidad legal pendiente de publicación)` |
| `legal.address` | `Quito, Ecuador (pendiente de confirmación)` |
| `legal.ruc` | vacío — mobile lo oculta, así que el footer queda sin RUC |

Es texto legal que se publica. Los tres placeholders salen literalmente en la
pantalla de términos y en la de privacidad, en mobile y en landing.

Fuera de la base, y sin forma de verificar desde el repo: bundle ID final,
`VITE_SITE_URL`, GitHub production environment, secrets de Render/Vercel
(`REDIS_URL`, `APP_VERSION`, `RENDER_GIT_COMMIT`), protección de contraseñas
filtradas en Supabase, y Turnstile cuando exista frontend y verificación
server-side.

## 7. Teléfono de soporte: placeholder que se marca (abierto, nuevo)

**Estado:** abierto. Agregado por esta revisión el 2026-10-05.

El centro de ayuda de mobile tiene un botón **Llamar** que abre
`tel:+593 99 000 0000`. Ese número **no existe**: es un placeholder de ejemplo
con el prefijo de Ecuador correcto y los dígitos locales en cero.

Está en dos lugares, y los dos son el número falso:

- `app_config.support.phone` = `+593 99 000 0000`. La propia descripción de la
  clave dice *"(placeholder EC, editable)"*.
- El fallback `strings.helpCenter.supportPhone` = el mismo string.

Como el centro de ayuda lee `useConfigValue("support.phone", ...)`, el valor de
la base gana: **el botón marca un número que nadie atiende**. No es un default
invisible, es la fila "Llamar" del centro de ayuda de los dos lados de la app
(`profile/help.tsx` y `business/[id]/help.tsx`).

Los emails de la misma pantalla **no** tienen el problema, pero tienen una
deuda chica: los fallbacks de `strings.ts` siguen en `@role.app` mientras la base
ya está en `@role.ec`
(`support.email` = `soporte@role.ec`, `contact.hola_email` = `hola@role.ec`,
`contact.negocios_email` = `negocios@role.ec`). No se ve mal mientras la config
cargue —gana la base—, pero un fallback desalineado es una bomba de reloj para
quien lea el string y asuma que es lo que ve el usuario.

Hay un test que fija el placeholder:
`src/core/i18n/operator-identity.test.ts:27` afirma que
`strings.helpCenter.supportPhone` es `+593 99 000 0000`. Cualquier cambio al
número lo rompe, así que también hay que tocarlo.

Un detalle que hace esto más raro de lo que parece: en la misma fila de tres
chips, "Chat" **sí** avisa "Próximamente disponible" con un toast, y "Llamar"
marca. El componente ya tiene el comportamiento honesto para un canal que no
existe; el teléfono simplemente no lo usa.

**Lo que hay que hacer es una decisión de negocio, no de código:** el número real
de soporte. No se puede inventar. Mientras no exista, las opciones son publicarlo
por `app_config`, ocultar el botón "Llamar", o poner un número que de verdad
atienda.

## 8. `app_config` con `role.ec` que ningún archivo del ledger escribe (abierto, nuevo)

**Estado:** abierto. Agregado por esta revisión el 2026-10-05. **Es la misma
clase de hueco que §0**, y en la dirección contraria: §0 fue una migración
aplicada sin registrar; este son valores aplicados sin registrar.

Producción corre en el dominio `role.ec`, pero el repo no lo describe:

| Clave | Valor en producción | ¿Alguna fila del ledger lo escribe? |
| --- | --- | --- |
| `support.email` | `soporte@role.ec` | **no** |
| `contact.hola_email` | `hola@role.ec` | **no** |
| `legal.contact_email` | `legal@role.ec` | **no** |
| `contact.negocios_email` | `negocios@role.ec` | no (aparece en plantillas, no en un write de `app_config`) |

Verificado con `count(*) ... where statements[1] like '%soporte@role.ec%'` y sus
equivalentes: **0, 0, 0**. El directorio siembra esos valores en `role.app`
(`20260821205638`). Los cuatro se cambiaron en el proyecto vivo por una vía que
no dejó fila en el ledger.

### Por qué esto no es cosmético: rompe el replay

`20260927053728_normalize_role_domain.sql` termina en un bloque `do $verify$`
que hace `raise exception 'non-social app_config still references role.app'` si
algún valor no social todavía dice `role.app`.

En producción **pasó**, porque producción ya estaba en `role.ec`. En un replay
desde el repo, donde el seed dice `role.app`, **esa aserción falla y la
migración hace rollback**. El arnés de tests del API ya lo documenta en
`apps/api/test/supabase-platform.ts`: marca `20260927053728` y
`20260927141336` como no replicables, y lo califica de *"la misma clase de hueco
que el drop de aridad-2 de `cancel_order`"*.

O sea: **`supabase db push` a un entorno nuevo se rompe en `20260927053728`.**

### Por qué la migración de arreglo no se escribió

El mismo archivo de tests dice que el arreglo es *"una migración de datos
registrada en el ledger"* y que **no** se escribió, por una razón que este
documento tiene que respaldar: el directorio de migraciones no puede ganar un
archivo que reclame ser historia que no ocurrió, y la tarea no podía aplicar a
producción. Correcto en su momento. Hoy es la deuda abierta.

### Lo que hay que hacer

Una migración de datos que normalice a `role.ec` las cuatro claves (y que siga
siendo idempotente, que es lo que le faltaba a la original), aplicada por
`apply_migration` y verificada con `md5sum` como manda `AGENTS.md`. Con eso se
resuelve también el dominio de los fallbacks de `strings.ts` —que hoy están en
`@role.app`— y el placeholder del teléfono de §7 puede publicarse en la misma
migración.