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

> **Qué cambió el 2026-10-22 (Plan 6).** El **§8 está cerrado**: la reparación
> existe (`20261022023427_record_role_ec_domain.sql`), está aplicada a producción
> y verificada con `md5sum`. El **§7 sigue abierto por el teléfono**, que es una
> decisión de negocio; de §7 sólo se cerró la parte de los correos de los
> fallbacks. **El resto del documento no se re-verificó**: cada sección lleva la
> fecha de su propia revisión, y en el índice de arriba sólo se movieron §7 y
> §8.

## Estado de los ítems

| # | Ítem | Estado 2026-09-25 | Estado 2026-10-05 | Estado 2026-10-22 |
| --- | --- | --- | --- | --- |
| 0 | Migración fuera del ledger | cerrado | cerrado | — sin cambio |
| 1 | Columnas de negocio expuestas a `anon` | **abierto (P1)** | **cerrado** — fase 3 aplicada | — sin cambio |
| 1b | Split de `businesses`, fase 3 | "escrita, NO aplicada" | **aplicada** el 2026-09-27 | — sin cambio |
| 2 | Ocho migraciones nunca ejecutadas | abierto | **cerrado** — 24/24 coinciden | — sin cambio |
| 3 | Seis migraciones ausentes del repo | deliberado | deliberado (sin cambio) | — sin cambio |
| 4 | Lint sin cubrir en mobile y commons | abierto | **cerrado** | — sin cambio |
| 5 | Verificación no posible desde el código | abierto | parcial: correo de activación **cerrado** | — sin cambio |
| 6 | Acciones de configuración externas | abierto | abierto (reducido) | — sin cambio |
| 7 | Teléfono de soporte placeholder | — | **abierto, nuevo** | **abierto** — se cerró la parte de los correos |
| 8 | `app_config` con `role.ec` fuera del ledger | — | **abierto, nuevo** | **cerrado** — reparación aplicada |

Lo único que queda abierto y bloquea el lanzamiento es **§6**. **§8** fue el más
grave de los nuevos —el repo no podía reproducir la configuración de soporte de
producción, y una reparación salía de §7 y de §8 a la vez— y **quedó cerrado el
2026-10-22**: la reparación existe, está aplicada y verificada con `md5sum`.
De §7 sale el teléfono, que es una decisión de negocio.

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

Los emails de la misma pantalla **no** tienen el problema, y esa deuda chica
quedó **cerrada el 2026-10-22**: los fallbacks de `strings.ts` ya dicen
`@role.ec` —`supportEmail` = `soporte@role.ec`, `contactEmail` =
`legal@role.ec` y `privacidad@role.ec`—, que es lo mismo que dice la base
(`support.email` = `soporte@role.ec`, `contact.hola_email` = `hola@role.ec`,
`contact.negocios_email` = `negocios@role.ec`). Los movió el Plan 6, que además
dejó un test que los fija (`apps/mobile/src/core/i18n/strings.test.ts`): un
fallback desalineado ya no puede volver a colarse en silencio.

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

## 8. `app_config` con `role.ec` que ningún archivo del ledger escribe (cerrado el 2026-10-22)

**Estado:** cerrado el 2026-10-22. **La versión anterior de este documento decía
"abierto" y afirmaba que la reparación "no se escribió"; hoy existe, está
aplicada, y el ledger describe la base.** Es la misma clase de hueco que §0, y
en la dirección contraria: §0 fue una migración aplicada sin registrar; este
eran valores aplicados sin registrar.

### Qué faltaba

Producción corre en el dominio `role.ec`, pero el repo no lo describía. Cuatro
claves de `app_config` valían en producción con un valor que **ninguna** fila
del ledger escribía:

| Clave | Valor en producción | ¿Alguna fila del ledger lo escribe? |
| --- | --- | --- |
| `support.email` | `soporte@role.ec` | **no** |
| `contact.hola_email` | `hola@role.ec` | **no** |
| `contact.negocios_email` | `negocios@role.ec` | no (aparece en plantillas, no en un write de `app_config`) |
| `legal.contact_email` | `legal@role.ec` | **no** |

Verificado con `count(*) ... where statements[1] like '%soporte@role.ec%'` y sus
equivalentes: **0, 0, 0**. El directorio siembra esos valores en `role.app`
(`20260821205638`). Los cuatro se cambiaron en el proyecto vivo por una vía que
no dejó fila en el ledger.

### Por qué esto no era cosmético: rompía el replay

`20260927053728_normalize_role_domain.sql` termina en un bloque `do $verify$`
que hace `raise exception 'non-social app_config still references role.app'` si
algún valor no social todavía dice `role.app`.

En producción **pasó**, porque producción ya estaba en `role.ec`. En un replay
desde el repo, donde el seed dice `role.app`, **esa aserción falla y la
migración hace rollback**. O sea: **`supabase db push` a un entorno nuevo se
rompía en `20260927053728`.** El arnés de tests del API ya lo documentaba en
`apps/api/test/supabase-platform.ts`, que marcaba esas dos migraciones como no
replicables y lo calificaba de *"la misma clase de hueco que el drop de
aridad-2 de `cancel_order`"*.

### La reparación

`20261022023427_record_role_ec_domain.sql`: una migración de datos
**idempotente**, aplicada por `apply_migration` el 2026-10-22. El `md5sum` del
archivo es `b8f50abf39ad858ffa05141ad025b8b7` y coincide con
`md5(statements[1])` de su fila del ledger (`version` `20261022023427`, `name`
`record_role_ec_domain`): el archivo es la prueba de lo que corrió.

No es una edición de los archivos que ya escribían estos valores.
`20260821205638`, `20260927053728` y `20260927141336` están **sellados** —su
`md5sum` coincide con el del ledger— y editarlos destruiría la evidencia de lo
que se hizo y de cuándo. La corrección va en un archivo nuevo, que es lo que
manda `AGENTS.md`.

### Qué cambió en producción — y qué NO

El archivo cambia en producción **tres cosas, y sólo tres**: lo que quedaba con
el dominio viejo, medido el 2026-10-21.

1. **El `mailto:` del pie del correo.** `email_components."Footer principal
   (oscuro)"` llevaba `<a href="mailto:hola@role.app">Soporte</a>`: un `mailto:`
   a un dominio en el que no se recibe correo. Ese enlace no llegaba a nadie.
   Ahora dice `mailto:hola@role.ec`.
2. **Tres `slides.redirect_url` inactivos.** Apuntaban a
   `https://role.app/about` (×2) y a `https://role.app/for-business`, que son
   páginas del dominio que se ha adquirido: mientras digan `role.app` llevan a
   una página que no existe. Los tres están `active = false` —por eso no era
   una urgencia y por eso era una bomba cargada: un banner que alguien reactiva
   mañana manda al usuario a un dominio muerto—. Ahora dicen
   `https://role.ec/about` (×2) y `https://role.ec/for-business`.
3. **El literal de reserva del trigger.** `public.notify_business_pending()`
   conservaba `'https://admin.role.app'` como **reserva** de `links.admin_url`.
   En producción no se nota, porque la clave está y vale `role.ec`; pero si la
   clave falta o se desactiva, el correo de revisión de negocios vuelve a
   apuntar a un host que no existe. Ahora la reserva es
   `'https://admin.role.ec'`.

**Y nada más cambió en producción:**

- **Las cuatro claves de `app_config` ya estaban bien.** El barrido de las
  claves no sociales no encuentra ninguna fila: producción ya llevaba
  `soporte@role.ec`, `hola@role.ec`, `negocios@role.ec` y `legal@role.ec`, y la
  migración no las tocó. Los valores de producción son los mismos antes y
  después.
- **Las cuentas sociales siguen en `role.app`, y es a propósito.**
  `social.facebook_url` = `https://www.facebook.com/role.app`,
  `social.instagram_url` = `https://www.instagram.com/role.app`,
  `social.tiktok_url` = `https://www.tiktok.com/@role.app` y
  `social.youtube_url` = `https://www.youtube.com/@role.app`. Ahí `role.app` no
  es un host: es el **nombre de la cuenta** de la marca en el dominio de otro.
  Reescribirlo rompería el enlace de cada pie de página, en producción, sin que
  nadie lo pidiera. Por eso el archivo exime `social.%`, y su aserción final
  también lo exime.
- **El barrido de los enlaces de las plantillas y de los componentes ya lo había
  hecho** el sellado `20260927053728`; el archivo nuevo vuelve a barrer y no
  encuentra nada.

### Lo que sigue abierto

1. **§7: el teléfono de soporte.** `app_config.support.phone` sigue siendo
   `+593 99 000 0000` —un número que nadie atiende— y el fallback
   `strings.helpCenter.supportPhone` dice lo mismo. **No se inventó un
   número**: es una decisión de negocio, y una migración no puede tomarla.
2. **Las dos migraciones que fallan en un replay siguen fallando, y en el
   mismo punto.** `20260927053728` y `20260927141336` abortan en su **propia**
   aserción —la que dice que ninguna clave no social puede decir `role.app`—, y
   esa aserción dispara **antes** de que el archivo nuevo llegue: el orden del
   directorio es el que es. Por eso el **conjunto de fallos fijado en
   `apps/api/test/supabase-platform.ts` no cambia** —siguen siendo cuatro
   entradas, y las dos de dominio siguen con su `P0001`—. Lo que cambia es la
   prosa de ese archivo, que ahora dice que la reparación existe y cuándo se
   escribió.
3. **Lo que está fuera del repo.** DNS, Vercel, `CORS_ORIGINS` y las URLs de
   redirección de Supabase no se pueden verificar desde el código: son acciones
   del partner, y quedan listadas en
   `docs/superpowers/plans/2026-10-21-dominio-role-ec.md` (§"Fuera de este
   plan").

**Lo que costó cerrar esto:** una migración de datos y el `md5sum` que la
prueba. Lo que no costó: los valores de producción, que no cambiaron.

**El fallo de fondo no fue el SQL, fue el mismo de §0 en la otra dirección:**
cambiar un valor en la base viva sin dejar fila en el ledger deja al directorio
de migraciones describir una base que no existe. Y por eso el arreglo no
consistía en editar las migraciones selladas, sino en escribir la historia que
faltaba y verificarla con `md5sum`.