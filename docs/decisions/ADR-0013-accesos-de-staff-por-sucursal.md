# ADR-0013: Accesos de staff por sucursal sobre `auth.users`

- **Estado**: Aceptado
- **Fecha**: 2026-10-16

## Contexto

Un negocio con varias sucursales tenía exactamente una persona con acceso: el dueño. La
razón no era una decisión de producto sino una restricción del schema:

```sql
create table if not exists public.business_ownership (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  owner_id    uuid not null       references public.profiles (id) on delete cascade,
  ...
);
```

`business_id` es PRIMARY KEY, así que el vínculo negocio-persona es 1:1 por construcción.
No hay forma de registrar a un empleado sin romper el modelo, ni de registrar a un
segundo responsable: la fila se llama "dueño" y solo puede haber una por negocio. Las ~20
policies que resuelven el permiso de negocio las hacen todas contra esa tabla
(`exists (select 1 from business_ownership o where o.business_id = <x> and o.owner_id = auth.uid())`),
más tres RPCs (`cancel_order`, `set_order_status`, `validate_pickup_code`) y el trigger
`bootstrap_business_companions`. Cambiarla no es cambiar una tabla: es cambiar el predicado
de permiso de todo el negocio.

`public.profiles.role` no ayuda: es un enum global (`user` | `business` | `admin`) sin
dimensión de negocio, así que no sabe distinguir a un cajero de un dueño dentro de la misma
empresa, y no sabe qué sucursal toca a cada uno.

Y el alta de un acceso tiene un requisito que RLS no puede dar: crear un `auth.users`
(`admin.createUser`) está fuera del alcance de una sesión normal. `business_members` no se
escribe desde el cliente —ni por policy, ni por DEFINER—, se escribe con `service_role`.

Medición de la base antes de decidir (2026-10-13):
`select count(*), count(distinct owner_id) from public.business_ownership;` → **16 | 11**,
con `admin@fudi.app` al frente, dueño de 6 de esos 16 negocios.

## Decisión

1. **`business_members` + `business_member_locations` reemplazan a `business_ownership`.**
   La tabla nueva no lleva `business_id` como PRIMARY KEY: lleva PK sobre su propio `id`, un
   `unique (business_id, user_id)` y un enum `business_member_role` (`owner`, `manager`,
   `staff`). El alcance por sucursal vive en la tabla aparte
   (`business_member_locations`), y el dueño no necesita filas de alcance: su rol da acceso
   total. El permiso se resuelve en helpers SQL, que las policies y los RPCs invocan por igual, y
   las ~20 policies viejas se recrean contra esos helpers conservando el orden
   *nuevo primero, viejo después*: las dos generaciones de policies quedan conviviendo, y su
   equivalencia se verifica por paridad de predicados antes de que caiga la anterior —
   con el alcance que esa paridad tiene, y que no es «para todo el mundo».

   **«Helpers» son siete, no tres, y el que faltaba era el único que puede negar.**
   El §5.1 del spec nombra tres: `business_member_role(business_id)`,
   `can_manage_location(business_id, location_id)` y
   `business_has_feature(business_id, feature)`. `pg_proc` tiene siete para este
   dominio, y los cuatro restantes nacieron de decisiones posteriores:

   | helper | rol | quién lo llama |
   | --- | --- | --- |
   | `business_member_role(uuid)` | el rol activo | 12 policies |
   | `can_manage_location(uuid, uuid)` | el permiso por sucursal | 13 policies |
   | `business_has_feature(uuid, business_feature)` | la feature del plan | la API, y los dos triggers de límites |
   | `business_plan_of(uuid)` | la única respuesta a «qué plan tiene este negocio» | `business_has_feature` y los dos triggers |
   | `business_member_session_valid(uuid)` | **la validez de la sesión** | **11 policies**, y `can_manage_location` |
   | `business_member_session_expires_at(integer, timestamptz)` | la aritmética de la expiración, `IMMUTABLE` | los tres anteriores |
   | `business_member_session_state(uuid default null)` | la explicación para el panel | el panel, y la API |

   Los conteos de policies salen de `pg_policies` y no de la §6.2: 12 y 13 no
   suman 24 porque **una policy usa los dos** —`Members can delete business
   locations` exige `business_member_role(business_id) = 'owner'` además de
   `can_manage_location`, que es la razón por la que borrar una sucursal es
   owner-only sin que el helper tenga que saber nada de borrar.

   `business_member_session_valid` es el que importa para esta decisión: es el único
   helper que puede **denegar**, y **11 de las 24 policies que resuelven por estos
   helpers dependen de él** — las que resuelven por rol en vez de por sucursal, que son
   las que `can_manage_location` nunca ve. Nació como rama dentro de
   `can_manage_location` y se movió a un guard aparte porque una función que devuelve
   el rol no puede negarle a `business_member_session_state` el `role` que el panel
   necesita para explicar una sesión vencida: las dos cosas no caben en el mismo
   retorno, y el panel las necesita a la vez.

   **Alternativa descartada — seguir con `business_ownership` y agregar una tabla aparte
   solo para empleados.** Habría dos fuentes de verdad para la misma pregunta ("¿esta
   persona entra a este negocio?") y por tanto dos caminos que se pueden desincronizar:
   un empleado borrado de la tabla nueva pero todavía en la vieja conservaría el acceso por
   RLS, que es exactamente el fallo que el soft-delete de la §4.1 vino a evitar. La tabla
   vieja no modelaba un caso; faltaba el caso, no el patrón.

   **Alternativa descartada — meter el rol en `profiles.role`.** El enum es global y no
   tiene dimensión de negocio: haría falta un enum por rol de negocio *más* el negocio en
   el que aplica, o un tipo compuesto, y ninguna de las dos se puede validar con RLS sin
   duplicar el predicado en cada policy. El eje de rol de negocio no es el de plataforma.

   `business_ownership` **sigue existiendo** al cierre de este plan: el retiro se movió al
   Plan 3, junto con el único consumidor que todavía la lee
   (`getBusinessesByOwnerId` en `apps/mobile`). Hasta que ese consumidor cambie, la tabla
   vieja y sus policies siguen vigentes, y eso es seguro **con un alcance que hay que
   decir, porque sin él la frase afirma más de lo que es cierto: las dos generaciones
   resuelven igual para un dueño con la sesión viva, y no resuelven igual para todos.**

   La generación vieja concede con `exists (business_ownership …)` y no mira el TTL.
   La nueva llama a `business_member_session_valid` y a una membresía con la sesión
   vencida la niega. Para un dueño que acaba de entrar —y para un dueño con
   `session_ttl_hours = 0`, que es lo que tienen los 16 dueños reales después de
   `20261016022631`— las dos conceden lo mismo, y por eso la paridad se verificó y es
   verde. Para un dueño o gerente con una sesión vencida la vieja sigue concediendo y
   la nueva no, y esa diferencia es **intencional**: es el TTL de la §5.2 del spec. No
   es una discrepancia que un test iba a encontrar, es una de las dos cosas que la
   decisión compró.

   **Y fue el eje de un incidente de producción, no un detalle teórico.** El
   backfill de `20261014005016` no escribe `last_authenticated_at` —no podía: su único
   escritor es `POST /staff/session`, y `apps/api/src/modules/staff/` no existe— y
   tampoco escribe `session_ttl_hours`, así que sus 16 filas nacieron con el
   `default 24`. **Un TTL sin sello es una sesión vencida por definición**, así que las
   25 policies de la generación nueva y los tres RPCs recreados le negaron todo a los
   16 dueños reales. El producto funcionó únicamente porque las policies viejas seguían
   en pie y las policies permisivas se combinan con `OR`. Corregido en
   `20261016022631` con `session_ttl_hours = 0` para esas filas; la lección que queda
   escrita aquí es que **convivir no es perdonar**: mientras la generación vieja siga
   concediendo lo que la nueva niega, el sistema parece sano mientras su política de
   permisos no lo está.

2. **El alias del staff es un `auth.users` real bajo un dominio de Rolé (`role.ec`), no una
   fila de una tabla de consulta.** El alias espeja `auth.users.email` y el PIN es la
   contraseña de ese mismo usuario: `centro@panaderia-familia.role.ec` entra por el login que ya
   existe, sin segunda puerta ni switch de modo, y `public.handle_new_user()` produce el
   perfil correcto sin tocar el trigger (`raw_user_meta_data.role = 'business'`). El dominio
   propio es lo que hace que un alias sobre el dominio real del negocio no rebote en
   GoTrue ni queme la reputación de envío de un dominio que ese negocio puede usar después
   para correo legítimo.

   **El índice único es por negocio, no global: `unique (business_id, lower(alias))`, sin
   predicado.** Y esto no es una preferencia de diseño sino una corrección medida: la
   primera versión del índice fue `unique (lower(alias))`, y el backfill de la migración
   siguiente la habría reventado con `23505`, porque `admin@fudi.app` es dueño de 6
   negocios y son 6 filas de miembro con el mismo alias. Un índice global afirmaría dos cosas falsas a
   la vez: que un alias no puede aparecer en dos negocios, y que el alias identifica a una
   persona cuando en realidad identifica un **acceso** —esta fila, en este negocio—. `alias`
   refleja `auth.users.email` y Auth garantiza que un correo es una persona, así que el
   login no se ambigua: el alias completo resuelve a exactamente un `auth.users`, y eso lo
   garantiza Auth, no el índice. El índice solo impide que la misma persona aparezca dos
   veces en el mismo negocio. Tampoco lleva `where deleted_at is null`: devolver el alias a
   la bolsa cuando la fila se da de baja dejaría vivo un identificador cuyo `auth.users`
   puede seguir existiendo.

   **Alternativa descartada — tabla de consulta `staff_aliases` (alias → negocio, más un
   PIN propio).** Significa que el login del staff deja de ser el login de GoTrue: la app
   tendría que autenticar el PIN contra una tabla, fabricar su propia sesión y resolver la
   identidad antes de que RLS pueda decir nada. El permiso del negocio —la única frontera
   según la ADR-0002— quedaría colgando de código de cliente. Se descartó porque el modelo
   que ya existe hace lo mismo gratis: `auth.users` ya es una identidad, ya tiene sesión,
   ya tiene ban, ya tiene recuperación y ya es la fila de la que cuelga `profiles`.

3. **El móvil consulta la API únicamente para administrar quién opera, y sigue
   operando contra Supabase directo como siempre.** Esto es una excepción consciente
   y acotada a la ADR-0002.
   **Esta decisión ya tiene implementación detrás: el Plan 2 la construyó.** El
   texto original de este párrafo decía que `apps/api/src/modules/staff/` **no
   existía** y que las nueve rutas estaban «especificadas, no construidas». Eso
   era verdad cuando se escribió y dejó de serlo: hoy las nueve rutas existen
   —ocho en `apps/api/src/modules/staff/staff.controller.ts` y
   `POST /staff/session` en `apps/api/src/modules/staff/staff-session.controller.ts`—,
   y el **addendum** del final de este documento las lista con el detalle de qué
   cambió. Lo que **no** existe todavía es el cliente HTTP del panel que las
   consumiría: ese es el Plan 3.
   Se listan igual porque la excepción es a la **arquitectura** y hay que poder
   razonar sobre su alcance: el cliente HTTP del panel se limita a esa pantalla
   —listar, dar de alta, editar, rotar PIN, pausar, reactivar, eliminar y sellar
   la sesión de entrada—. Todo lo demás —catálogo, pedidos, sesiones,
   preferencias— sigue yendo directo a Supabase con RLS como frontera, sin cambiar.

   **Alternativa descartada — una Edge Function para el alta.** Partía las reglas de negocio
   en dos runtimes: la API no conocería las reglas de acceso que la Edge Function tendría,
   y cualquier cambio futuro a «quién puede administrar a quién» tendría que hacerse dos
   veces y a mano. La API ya es donde vive el resto de las reglas que no deben vivir en
   cliente (`admin.createUser` + ban + compensación si el alta falla a medias).

   **Alternativa descartada — API intermediaria para todo el móvil.** Es la que la ADR-0002
   rechazó en agosto y sigue siendo la correcta: RLS evalúa el permiso en el mismo sitio
   que lo escribe, sin traducción y sin que ese permiso dependa de que el cliente pase por la
   API. Concederle ahora la intermediación total por nueve rutas de administración
   tiraría una decisión de arquitectura por una necesidad que se resuelve con una pantalla.

4. **Un gerente puede pausarse a sí mismo, y es a propósito.** La regla de contención del §8
   («un `manager` sólo toca accesos cuyas sucursales estén contenidas en las suyas») no
   menciona al que llama, así que el predicado admite que un gerente se pause a sí mismo: su
   alcance lo contiene, y la única otra exclusión —nunca administrar al dueño— es sobre un
   **rol**, no sobre una persona. **Permitido, y escrito porque el §8 no lo nombra** y un
   botón raro sin explicación se lee como un descuido.

   El argumento es uno, y es el del rol más privilegiado: **un dueño no puede ser desactivado
   por nadie** —`enforce_owner_is_untouchable` levanta `R0002`, y `20261017040808` lo
   discute también en el `DELETE`—, así que «uno siempre puede cortar su propio acceso» ya es
   la regla del rol con más poder del sistema. Un gerente que no puede irse de un negocio
   queda atrapado en él, y un gerente atrapado es un fallo peor que el que un auto-ban
   podría causar: necesita que otro lo note, y no hay nadie mirando.

   *(Actualizado por el Plan 2: la regla del dueño se volvió **más** fuerte, no más floja.
   Hoy el dueño tampoco se puede **degradar**, y `20261020052915` lo discute. El
   addendum §A.2 dice qué cambió y qué consecuencia tiene.)*

   La contención no se toca: sigue negando a **cada otro** gerente fuera del alcance de quien
   llama, y el auto-ban es el único caso en que el objetivo está por definición dentro. Las
   dos mitades tienen test (`staff.service.spec.ts`: se pausa, y no se pausa al de la otra
   sucursal), y lo que se está fijando es el comportamiento observable, no que el predicado
   siga siendo el de antes.

## Consecuencias

- El permiso de negocio tiene **una sola respuesta** y una sola forma de calcularla:
  `business_member_role` / `can_manage_location`. Las policies viejas y las nuevas
  coexisten hoy y resuelven igual **para un dueño con la sesión viva**, que es lo
  único que la matriz de paridad mide y lo único que la matriz de paridad puede
  medir; no resuelven igual para una membresía con el TTL vencido, porque la
  generación vieja no lleva TTL. Esa diferencia es la del §5.2 del spec y es
  comprada, no un defecto pendiente — pero mientras la vieja siga concediendo lo que
  la nueva niega, la paridad verde no es evidencia de que el sistema esté sano, sino
  evidencia de que la policy vieja todavía está haciendo el trabajo. El retiro de
  `business_ownership` (y de sus policies) ocurre en el Plan 3, con
  `getBusinessesByOwnerId` ya migrado al modelo de membresía.
- **Los límites de plan son dos copias y ahora están contrastadas.** El dueño ve
  `BUSINESS_PLAN_LIMITS` en el panel y el motor aplica el `case v_plan` de dos
  triggers. `plan-limits.db.spec.ts` lee los tres cuerpos del `pg_proc` vivo y los
  compara contra el TypeScript celda por celda, así que la divergencia sale en el
  `bun test` y no el día que un dueño llega al tope que el panel no le dijo.
- **La escritura de `business_members` no la hace el cliente**, ni siquiera un `owner`: no
  hay policy de INSERT/UPDATE/DELETE y el alta necesita `service_role`. La ausencia de
  policy es lo que RLS sabe hacer, y es la respuesta.
- La API vuelve a preguntar lo mismo que RLS ya sabe responder (`can_manage_location`), pero
  lo pregunta **en su propia sesión y con `service_role`**, donde RLS no aplica: el service
  layer tiene que contestar por su cuenta. Es una segunda copia a propósito —son dos
  fronteras con dos contextos distintos— y lo que no es aceptable es que diverjan. La
  misma regla aplica al catálogo de planes: `BUSINESS_PLAN_LIMITS` en `commons` y el
  `case v_plan` de los triggers son dos copias, si divergen el dueño ve un número que el
  motor no aplica, y por eso **ya no está pendiente del Plan 2**:
  `apps/api/src/database/security/plan-limits.db.spec.ts` lee los tres cuerpos del
  `pg_proc` vivo y los compara contra el TypeScript celda por celda.
- **La sesión es la excepción a esa regla, y ya no es una copia.** «¿Puede esta sesión
  operar?» la preguntaba `StaffService` en TypeScript —`last_authenticated_at + ttl`— y eso
  era una **cuarta** cuenta de la expiración: las otras tres (`can_manage_location`,
  `business_member_session_valid`, `business_member_session_state`) ya llamaban a
  `business_member_session_expires_at`, y el guard de catálogo que impide que vuelvan a
  calcularse lee `pg_proc.prosrc`, así que no podía ver una cuarta copia escrita en un `.ts`.
  Ahora `apps/api/src/modules/staff/staff.repository.ts` declara el `auth.uid()` **ya
  verificado por el guard** con `set_config('request.jwt.claims', …, true)` dentro de una
  transacción —que es lo que hace PostgREST al traducir una llamada RPC— y devuelve **tal
  cual** el `jsonb` de `business_member_session_state`, incluido el `expires_at`. El panel y
  RLS leen el mismo número y no queda nada que pueda apartarse en silencio. Sigue siendo
  esta API la que pregunta, y `service_role` el contexto: lo que cambió es que ya no
  responde por su cuenta.
- El dominio `role.ec` es un punto único de fallo de la experiencia de staff: si la
  creación del `auth.users` falla, el negocio tiene una membresía sin identidad. Por eso el
  alta es compensada (se revierte la fila si el usuario no se pudo crear) y por eso el
  cliente HTTP del panel trata el alta como una transacción, no como dos llamadas.
- El login del staff no tiene recuperación por correo (el PIN no se guarda en ningún sitio):
  la contraseña de un `auth.users` bajo `role.ec` no se puede mandar. La rotación de PIN es
  el único camino, y es una decisión consciente.
- Revisar esta decisión cuando el Plan 3 haya dado de baja `business_ownership` y sus
  policies —ahí la paridad deja de ser un estado transitorio y pasa a ser el estado final—,
  o cuando el alta deje de ser la única operación que necesita `service_role` desde el
  cliente.

---

## Addendum (2026-10-20) — De «decidido» a «construido»

Lo de arriba describe el **diseño**. Este addendum dice qué de ese diseño
**existe hoy**, con nombre de archivo y de migración (§A.1), y registra las **cuatro
decisiones que el Plan 2 tomó y que este ADR todavía no cargaba** (§A.2 a §A.5). Si
algo de acá se contradice con una decisión de arriba, **manda la de arriba** y esto es
un bug: el addendum documenta, no redefine.

### A.1 — Las nueve rutas del §8 del spec existen

| ruta | archivo |
| --- | --- |
| las ocho `businesses/:businessId/staff…` | `apps/api/src/modules/staff/staff.controller.ts` |
| `POST /staff/session` (la novena) | `apps/api/src/modules/staff/staff-session.controller.ts` |

La puerta es una: `StaffService.requireActor` (`apps/api/src/modules/staff/staff.service.ts`),
y la pregunta de la sesión es **de la base** (`business_member_session_state`), no
una cuarta cuenta de la expiración escrita en TypeScript.
`POST /staff/session` **no** pasa por `requireActor` a propósito —sella y explica,
no administra— y por eso un `staff` puede llamarla.

Lo que **no** existe todavía es el cliente HTTP del panel que las consumiría: es
el Plan 3, y es la excepción consciente a la ADR-0002 que la decisión 3 describe.

### A.2 — El rol del dueño es inmutable, y el motivo es la transferencia que no existe

`20261020052915_owner_cannot_be_demoted.sql` **superseede** a
`20261017040808_owner_cannot_be_deleted.sql`, que queda sellado con su `md5`
(`supabase/migrations/README.md` explica el procedimiento y por qué un archivo
sellado no se reescribe). `enforce_owner_is_untouchable` ahora niega **tres**
salidas, y las tres con `R0002`:

- **degradar** (`new.role <> 'owner'`): «el dueño del negocio no se puede degradar;
  la transferencia de propiedad no existe en esta versión»;
- **desactivar** (`status → 'disabled'`);
- **dar de baja** (`deleted_at`).

**El motivo es la transferencia, no la comodidad.** El §5.4 del spec deja la
transferencia de propiedad fuera de la v1. Una degradación **sin transferencia
atómica** deja al negocio sin dueño: las puertas owner-only niegan a todos
—incluido al degradado—, `listForUser` borra el negocio del listado del panel,
`business_ownership` sigue nombrando al degradado (las policies viejas le siguen
dando acceso por PostgREST: **la API y RLS divergen**, que es justo lo que esta
ADR dice que no es aceptable) y **no hay vuelta atrás**, porque `POST /staff`
rechaza `role: 'owner'` y un `PATCH` con `role: 'owner'` es un 422.

En la API la misma regla se aplica **antes de escribir** y sin depender del texto
del trigger (`staff.service.ts`, en `update`: un 422), así que el dueño recibe un
mensaje con la razón y no una excepción de Postgres.

**La consecuencia hay que decirla entera, porque es grande: un dueño no puede borrar su
cuenta por ninguna vía — y esto no depende de que el negocio esté vivo.** La puerta
(`apps/api/src/modules/auth/auth-account.repository.ts`, `countRetained`) cuenta
membresías de dueño **vivas** (`role = 'owner'` y `deleted_at is null`) y **no mira
`businesses.is_active`**: desactivar el negocio no abre la salida, y borrarlo tampoco —la
cascada `business_members_business_id_fkey` dispara `trg_enforce_owner_cannot_be_deleted`
y falla con `R0002`. (Medido contra la base viva el 2026-10-20: 16 negocios, 2
desactivados, 16 membresías de dueño vivas —**2 de ellas en negocios desactivados**, que
siguen bloqueadas.) La transferencia no existe, y por eso:

| vía | qué contesta el cliente | dónde se decide |
| --- | --- | --- |
| `DELETE /auth/account` | **409** | la API, con `owner_memberships > 0` |
| `PATCH …/staff/:memberId {"role":"manager"}` sobre su propia fila | **422** | la API, antes de escribir; y `R0002` en la base |
| `POST …/staff/:memberId/disable` sobre su propia fila | **422** | la base (`R0002`), que la API traduce |
| `DELETE …/staff/:memberId` sobre su propia fila | **422** | la base (`R0002`), que la API traduce |
| `POST /staff {"role":"owner"}` | **422** | la API, antes de escribir |

El 409 **no nombra ninguna puerta que lo resuelva**, porque no hay ninguna. Antes
prometía «degradá o transferí» y la degradación ya no existe: un 409 que manda a
una puerta que rebota es peor que uno que no da ninguna. El texto que quedó dice
la verdad —la cuenta no se puede borrar mientras sea el dueño, y eso no lo cambia
ninguna ruta de la API— y dice **cuándo** vuelve a ser borrable: cuando el negocio
ya no sea suyo. **Resolverlo es cosa del equipo de Rolé, fuera de la API**, porque
es el único que puede cambiar una fila de dueño.

La transferencia de propiedad es, por lo tanto, el **primer** ítem del Plan 3: no
es limpieza, es un hueco de producto.

### A.3 — La entitlement del plan se consulta en la API **al crecer**, y se rechaza con `R0001`

`20261020053935_plan_limits_counting_and_demotion.sql` (que supersede a
`20261020052952_plan_feature_refusal_on_growth.sql`) hace que los dos triggers de
topes neguen la **feature** `staff_access` **sólo cuando la escritura crece**
(`v_agrega`): un plan sin la feature no puede **crear** accesos, pero los que ya
existen siguen funcionando —cambiar la etiqueta, pausar, dar de baja, sellar la
sesión—. Eso es el §5.3 del spec: el plan bloquea **crecer**, no operar.

La API hace la misma pregunta **antes del alta** (`staff.service.ts` →
`assertStaffAccessEntitlement` → `business_has_feature`), porque sin ella el
primer plan sin `staff_access` moría con el `P0001` crudo del trigger y el dueño
recibía un **500** con la prosa de Postgres en el log, en vez de la negativa que
puede actuar. Ésta es la pregunta que el §5.1 le asignaba a la API y que hasta el
Plan 2 nadie preguntaba.

**El código es `R0001`, y es el mismo que el del tope.** Un revisor pidió un
código distinto (`R0003`) para la entitlement, y hay razones para no adoptarlo:
*el tope es un NÚMERO y la feature es una ENTITLEMENT*, y un código distinto lo
diría mejor. La razón para reusar `R0001` es que **el panel conoce una sola
negativa de plan**: `staff.service.ts` las construye con el mismo cuerpo
(`planRefusal`), así que no pueden derivar en dos formas distintas y el panel no
tiene que aprender un segundo contrato.

**El costo de reusar `R0001` es concreto y hay que dejarlo escrito:** `R0001` no
distingue *por qué*. El tope trae `detail=business=… plan=… limit=… current=…`; la
entitlement trae `detail=business=… plan=… feature=staff_access`. La UI **no
puede** decidir por el motivo sin leer el `detail`, que es prosa — si el panel
quiere distinguir «te pasaste de miembros» de «tu plan no trae la feature», tiene
que parsear la cadena. Si mañana se elige `R0003`, el cambio es **de un solo
lado**: la constante y el `mapWriteError` de `staff.service.ts`, más el mapeo del
panel, que es donde de verdad se nota. **La decisión es reusar `R0001` mientras el
panel no conozca `R0003`.**

### A.4 — `isDeliverableAlias` y `isRoleEcAlias`: dos preguntas, dos funciones, y no se fusionan

`packages/commons/src/business/schemas/business-member.schema.ts`:

- `isRoleEcAlias` contesta «¿es una **cuenta de equipo**?» — la regla del §3.1 es
  el **sufijo** `.role.ec`, así que el ápice `x@role.ec` **no** es cuenta de equipo.
- `isDeliverableAlias` contesta «¿hay una **bandeja** detrás?» — y el ápice
  **tampoco**: `role.ec` es un dominio de la plataforma con buzones vivos
  (`notificaciones@role.ec`, `negocios@role.ec`), pero no hay bandeja para
  `centro@role.ec`.

Las dos se separan justo en el ápice, y por eso **no se pueden fusionar**: un
subdominio es cuenta de equipo y **no** es bandeja; un dominio propio no es cuenta
de equipo y **sí** es bandeja. La API usa `isDeliverableAlias` en los tres guardas
de correo (`forgot-password`, `change-email` y `register`) porque lo que importa
ahí es la bandeja; y el aviso del §9.4 (`businessMemberAliasWarnings`) usa la
misma, porque lo que **afirma** el aviso es la bandeja.

**`isRoleEcAlias` no tiene hoy ningún llamador en producción, y se conserva a
propósito.** Es el contrato del §9.1 del spec —el «¿olvvidaste tu contraseña?»
condicional del login del móvil y el «pide a tu dueño que te rote el PIN»—, que
es exactamente lo que el móvil tiene que preguntar en el Plan 3. **Borrarla como
código muerto rompe el contrato del §9.1 antes de que exista su consumidor**, así
que está anotado acá para que el próximo que la encuentre no la toque.

### A.5 — El borrado de cuenta: un **409 antes de la cascada**, no un cambio de schema

`DELETE /auth/account` es el **único** camino de borrado de cuenta del producto
(lo verificó la revisión de la Task 5: `me` no tiene borrado de cuenta, el
`DELETE` del staff es un soft-delete, y los dos `admin.deleteUser` del alta son
compensaciones de cuentas que nunca llegaron a tener membresía). El Plan 2 lo
dejó así:

- **El 409 va antes de la primera llamada destructiva.** En
  `apps/api/src/modules/auth/auth.service.ts`, `deleteAccount` lee `countRetained`
  y, si `owner_memberships > 0`, lanza el `ConflictException` **antes** de
  `admin.deleteUser`, **antes** de `anonymise` y **antes** de `eraseAccount`. La
  negativa es contestable y reintentable, y el test afirma que nada se llamó.
- **No es un cambio de schema.** La FK `business_members.user_id → profiles.id`
  **sigue siendo `ON DELETE CASCADE`**
  (`apps/api/src/database/schema/business-members.ts`). Lo que se movió fue **la
  capa de aplicación**, que es donde estaba el problema: la cascada dispara el
  trigger del dueño y el borrado de cuenta fallaba sin explicación.
- **La cascada se vuelve inalcanzable por la puerta, no por el schema.** Con
  `memberships > 0` la cuenta va por `anonymise`: el perfil **sobrevive**, y con él
  cada membresía que apunta a él, así que no hay nada que la cascada destruya. El
  alias queda quemado —el índice único es por negocio y **no** lleva predicado de
  `deleted_at`— y el conteo de «quién estuvo aquí» sigue siendo contestable.
- **Está probado en la cadena real**, no con un repositorio simulado:
  `auth.service.db.spec.ts` corre contra el espejo con los triggers del ledger
  instalados *verbatim* y trae un **control positivo** que falla ruidoso si el
  espejo pierde el trigger —que es el hueco de fixture que había escondido la
  regresión—.

Con el dueño inmutable (§A.2), la rama `owner_memberships > 0` es la **única**
forma de tener una membresía viva de dueño, y por eso el 409 no puede tener una
salida por la API: la salida es **de producto** (transferir la propiedad), no de
software.