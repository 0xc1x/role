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

---

## Addendum §B (2026-10-21) — De «decidido» a «construido» (Plan 3)

El addendum §A documentó lo que el **Plan 2** construyó. Este §B documenta lo que el
**Plan 3** construyó: las tres decisiones que el partner tomó el 2026-10-21 (D1, D2, D3),
la frontera de datos que resultó, el invariante que sostiene la propiedad, la regla del
negocio inactivo y el retiro de `business_ownership`.

**Escrito desde lo que se construyó, no desde lo que se planeó.** Donde la implementación
se apartó del plan, este §B dice lo que hay —con su número medido— y el plan se corrige.
Las correcciones están marcadas con **[corregido]**.

### B.1 — Las tres decisiones, con el archivo y la migración que las implementa

| decisión | qué es | dónde está |
| --- | --- | --- |
| **D1 — la transferencia de propiedad existe** | `public.transfer_business_ownership(uuid, uuid) → jsonb`: `volatile`, `security definer`, `search_path = ''`, ACL **`{postgres, service_role}`** — `anon` y `authenticated` no la pueden abrir | `supabase/migrations/20261020163244_ownership_transfer.sql`; el cerrojo, en `20261020174431_ownership_transfer_concurrency.sql` |
| | la puerta HTTP: `POST /businesses/:businessId/ownership/transfer`, cuerpo `{ new_owner_member_id }`, respuesta `{ previous_owner, new_owner }` | `apps/api/src/modules/staff/ownership.controller.ts`; el servicio, `apps/api/src/modules/staff/staff.service.ts`; los contratos, `packages/commons/src/business/schemas/business-ownership.schema.ts` |
| **D2 — un negocio inactivo libera a su dueño** | `public.release_business_ownership(uuid, uuid) → jsonb`: `volatile`, `security definer`, `search_path = ''`, ACL **`{postgres, service_role}`** | `supabase/migrations/20261020172601_inactive_business_releases_owner.sql` |
| | la recuperación: `public.assign_business_ownership(uuid, uuid) → jsonb`, misma forma y mismo ACL | `supabase/migrations/20261020172817_assign_business_ownership.sql` |
| | la puerta HTTP: `POST /businesses/:businessId/ownership/restore`, cuerpo `{ member_id }`, respuesta `{ owner }` | `apps/api/src/modules/staff/ownership.controller.ts` |
| | la puerta del borrado de cuenta (el 409) y la rama que anonimiza | `apps/api/src/modules/auth/auth-account.repository.ts` (`countRetained`, `anonymise`) y `apps/api/src/modules/auth/auth.service.ts` |
| **D3 — el alcance por sucursal es una frontera de datos** | `public.business_member_reaches_member(uuid, uuid) → boolean` — `stable`, `security definer`, `search_path = ''`, ACL **`{postgres, service_role, authenticated}`** (una policy la evalúa como el rol que la invoca) | `supabase/migrations/20261020134712_member_scope_predicates.sql` |
| | `public.business_member_covers_locations(uuid, uuid[]) → boolean` — misma forma, ACL **`{postgres, service_role}`** (sólo la API la llama) | el mismo archivo |
| | la frontera en las policies: la rama del rol de `can_manage_location` y las dos policies del roster | `supabase/migrations/20261020152852_location_scope_in_policies.sql` |

Los tres ACL son **medidos**, no copiados: `pg_proc.proacl` en la base viva, con el
`revoke all … from public, anon, authenticated` y el `grant execute … to service_role`
escritos **explícitamente** en cada migración, porque `create or replace` conserva el
ACL pero no lo deja a la vista.

**El que llama no es un argumento, salvo en la liberación.** La transferencia lee
`auth.uid()`: una función que recibiera «el dueño» como parámetro dejaría que
cualquiera pidiera transferir la propiedad de cualquiera. La liberación es la
excepción, y por una razón buena: **la pide una cuenta que se va, que ya no tiene
sesión** — su `actor` es un argumento, y la función comprueba ella misma que ese
argumento es el dueño vivo del negocio.

### B.2 — La regla del alcance, tal como quedó

> **El dueño alcanza el negocio entero, con y sin filas de alcance. Cualquier otro
> miembro alcanza exactamente las sucursales de sus filas vivas de
> `business_member_locations`. Sin filas, no alcanza ningún recurso.**

La regla está en **dos** helpers, y no hay una tercera copia en TypeScript:

- **`can_manage_location(business_id, location_id)`** — la frontera de **recursos**.
  Su rama de rol pasó de `when r.member_role in ('owner','manager') then true` a
  `when r.member_role = 'owner' then true`; el `manager` llega a la fila por la rama
  del alcance, y un `manager` sin filas llega a nada.
- **`business_member_reaches_member(business_id, member_id)`** — la frontera de
  **personas**. El dueño vivo alcanza a todos los accesos; cualquier otro miembro
  alcanza a un acceso si y sólo si **su** alcance es no vacío, **el del acceso** es no
  vacío, y **el del acceso está contenido en el suyo** (subconjunto, no intersección).

**El alcance vacío es una respuesta, no una ausencia.** Sin filas de alcance, un
`manager` o un `staff`:

- **no alcanza ningún recurso**: ni una sucursal, ni un producto, ni un pedido, ni un
  evento, ni un intent de pago, ni un cliente de un pedido — en lecturas **y** en
  escrituras, que es lo que D3 pedía y lo que la §5.1 del spec ya no puede negar;
- **sí alcanza su propia fila de membresía**, y nada más. La excepción vive **en el
  helper** y no en la policy, por dos razones: la API pregunta a la base (y el
  autoservicio de la decisión 4 de este ADR es una escritura de la API), y una policy
  no puede decir «mi fila» sin leer `business_members` con la RLS del llamador —lo que
  recursiona— o sin un segundo helper `security definer`, que sería un segundo sitio
  con la regla.

**El inventario, medido en `pg_policies` el 2026-10-21** (no estimado):

| grupo | cuántas | cuáles | qué pasó |
| --- | --- | --- | --- |
| **dependen del alcance** | **15** | las **13** que leen `can_manage_location` + las **2** del roster | **14 cambian** de comportamiento |
| … de las cuales **no cambian** | 1 | `business_locations` · `Members can delete business locations` (DELETE) | exige `role = 'owner'`: **no da alcance a nadie**, así que el cambio del helper no la toca. Por qué no cambia: borrar una sucursal es *owner-only* por decisión de producto (§5.1 del spec), no por límite de ubicación |
| **siguen siendo de negocio entero** | **9** | `business_hours` (1) · `business_locations` INSERT (1) · `business_notification_preferences` (3) · `businesses` SELECT y UPDATE (2) · `coupons` (1) · `payouts` (1) | **no cambian**: el alcance acota *las cosas que viven en una sucursal*; lo que no tiene dimensión de sucursal sigue siendo del negocio entero, y se concede **por rol** |

> **[corregido] El plan decía «diez» de negocio entero y la lista tenía nueve.** La
> cifra correcta es **nueve**. De las **doce** policies que usan `business_member_role`
> (medido en `pg_policies`), **dos** cambian de texto —las del roster—, **una** es la
> owner-only que no cambia ni es de negocio entero
> (`Members can delete business locations`), y **nueve** se quedan de negocio entero.
> La aritmética del plan —«doce, dos cambian, diez se quedan»— metió la owner-only
> en el grupo de las de negocio entero, y su lista tenía nueve filas, no diez.

**Las trece policies que leen `can_manage_location` no se tocaron.** Cambió lo que el
helper contesta, no su texto: trece diffs de policy son trece copias de una regla, y
trece copias son trece formas de escribirla distinto. Dos de las trece se tocan
**por efecto** del cambio del helper y no por su texto: `Members can view business
locations` y `Members can update business locations`.

**Las dos policies del roster se reescribieron con `alter policy`, no con `drop` +
`create`.** Postgres no tiene `create or replace policy`; `alter` conserva el OID y no
saca nunca la policy de `pg_policies`, y `drop` + `create` abre una ventana en la que
la tabla queda abierta para el rol que la policy restringía. Las dos llevan el
**requisito de rol DENTRO** (`business_member_role(business_id) in ('owner','manager')`),
porque la regla del alcance **no distingue por rol**: un `staff` cuyo alcance cubre el
de otro acceso cumple el helper, y sin el requisito de rol vería el roster —cuyos
alias espejan `auth.users.email`—.

**Dos consecuencias que hay que decir en voz alta**, porque el panel las va a
preguntar:

1. **El dueño desaparece del roster del gerente.** Es lo que el §8 ya decía («un
   gerente nunca administra al dueño») y lo que la API ya hacía; ahora la base lo dice
   también, y las dos capas coinciden.
2. **Un gerente que crea una sucursal no la administra.** Crear es de negocio entero
   (la fila que se crea no está en el alcance de nadie) y administrar es del alcance.
   La sucursal nueva no la administra nadie hasta que el dueño la pone en el alcance de
   alguien. **Es una decisión pendiente del partner** —ver §B.7.

**Lo que NO cambió, y por qué, con nombre:**

- `Anyone can view active business locations` (`roles = public`, `is_active = true`)
  deja leer las sucursales **activas** a cualquiera: un `staff` sigue leyendo las
  sucursales activas que no son de su alcance. El §5.1 del spec ya lo dice; el Plan 3
  no lo cambió y el texto no puede afirmar lo contrario.
- El `UPDATE` de una sucursal sigue concediéndose a quien la alcanza: un `staff` con
  alcance sobre la sucursal A puede renombrar A. El §9.3 del spec decidió que eso se
  recorta en la UI, y el Plan 3 no reabre esa decisión.

### B.3 — «Un negocio activo tiene un dueño vivo», y por qué es un trigger diferido

> **Un negocio ACTIVO siempre tiene un dueño vivo. Un negocio INACTIVO puede no
> tenerlo.**

El invariante vive en un **`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED …
FOR EACH ROW`** sobre `business_members` (`trg_business_keeps_an_owner`,
`public.enforce_business_keeps_an_owner()`, `security definer`, `search_path = ''`).

**Por qué diferido y no `BEFORE`.** La degradación y la promoción tienen que ser
**dos sentencias**. El índice parcial `business_members_one_owner_per_business` comprueba
fila por fila, así que en una sola sentencia el orden de las filas no está garantizado
y la promoción puede chocar con un `23505` —un error de índice, no una regla—. Un
`BEFORE` vería el **estado intermedio**: el negocio sin dueño, y negaría una
transferencia legítima. El diferido se evalúa **al commit**, con el estado final.

**El predicado, exacto:** un negocio activo tiene **exactamente un** dueño vivo, y
«dueño vivo» es una sola definición —`role = 'owner'` ∧ `status = 'active'` ∧
`deleted_at is null`— en `public.business_live_owner_count(uuid)`, que consultan el
trigger, la guarda de reactivación, la recuperación y el servicio. Como el índice
parcial impide dos dueños vivos, «exactamente uno» y «al menos uno» son la misma cosa;
se escribió la forma exacta porque es la que dice la regla.

**El trigger mira los dos negocios de la fila** —el de destino y el de origen cuando
la fila se muda de negocio—, porque una mudanza puede dejar al negocio viejo sin
dueño.

**Lo que se movió de sitio al construirlo:** la guarda de degradación y la de
`deleted_at` estaban en el `BEFORE UPDATE` de la fila (`enforce_owner_is_untouchable`),
y de ahí se fueron al trigger diferido. El efecto observable: **una degradación suelta
ya no se niega en la sentencia, se niega en el commit**, y sólo si el negocio sigue
activo. La guarda de `status → 'disabled'` **se queda** en el `BEFORE`, porque una
revocación merece un error inmediato con su propio mensaje.

### B.4 — El negocio inactivo, su dueño, y quién reactiva

**«Liberado» tiene cinco mitades, y las cinco están en la base** (no en TypeScript):

1. **La membresía de dueño se ARCHIVA** (`deleted_at`), no se borra: la fila queda para
   saber quién operó en el negocio, y el alias queda quemado a propósito (el índice
   único es por negocio y **no** lleva predicado de `deleted_at`).
2. **Sus filas de alcance se archivan con ella** (`business_member_locations`): una
   membresía archivada con su alcance vivo sigue diciendo «esta persona llegaba a
   esta sucursal» de alguien que ya no está.
3. **La fila de `business_ownership` de ese negocio se BORRA** —mientras la tabla
   exista—. [corregido] **Esta mitad ya no aplica: la tabla se retiró en la Task 10**
   (ver §B.5), y el `delete` desapareció con ella.
4. **El negocio no se borra ni se reactiva**: conserva ofertas, pedidos, sucursales y
   horarios. Esto es una jubilación, no un borrado.
5. **Los otros miembros no se tocan**: el gerente y el empleado siguen vivos, con su
   alcance, y son los que reciben al dueño nuevo cuando la plataforma lo devuelva.

**La liberación es explícita y sólo para un negocio inactivo.** `release_business_ownership`
niega con `R0004` si el negocio está activo («un negocio activo no libera a su dueño:
transferí la propiedad»), y el `DELETE` de la cuenta se lleva por delante esa salida:
la puerta del 409 cuenta **sólo dueños de negocios activos**, así que el dueño de un
negocio inactivo puede borrar su cuenta sin transferir nada.

**Un negocio sin dueño no vuelve a la vida.** `trg_business_reactivation_needs_owner`
(`BEFORE UPDATE OF is_active ON businesses`) niega con `R0002` la activación de un
negocio sin dueño vivo. El trigger diferido de §B.3 vigila las **membresías**, así que
sin este trigger `update businesses set is_active = true` dejaba un negocio activo sin
dueño y nadie lo avisaba.

**Quién reactiva:** el dueño, si lo hay —y un dueño con sesión viva es el que
transfiere (§B.1)—; y si no lo hay, **la plataforma**. `assign_business_ownership` es
la puerta del rescate, y **no es una bandera de la transferencia**: son dos hechos y
dos permisos. La transferencia la pide el dueño, que es quien entrega; la recuperación
la pide la plataforma, que es quien rescata. Por eso **niega con `R0004` si el
negocio ya tiene un dueño vivo** —«este negocio ya tiene un dueño: usá la
transferencia»—, que es la línea que impide que la recuperación sea una segunda puerta
para saltarse el invariante.

**La recuperación es de la plataforma, y la API lo comprueba con el `app_role`:**
`user.role === 'admin'`. La función es ejecutable sólo por el servicio, así que el
móvil no la puede abrir. El **permiso de plataforma** no vive en la base, y está
dicho: la base no sabe qué es un admin de plataforma.

**Y hay una segunda puerta, y es la que hace posible el rescate:** un negocio cuyo
dueño se fue puede quedarse **sin ningún acceso**, y entonces no hay ni a quién
transferirle la propiedad ni quién administre lo que queda. La rama de admin vive en
**`create`** (`POST /businesses/:id/staff`), no en `requireActor` (que sigue negando
al admin), y su condición es **doble**: `user.role === 'admin'` **y** el negocio no
tiene dueño vivo — y esa segunda mitad la contesta la **base**
(`public.business_live_owner_count`), no un predicado propio de la API, para que la
puerta no pueda abrir un negocio que la operación después cierra.

**Lo que la regla de la reactivación rompió, y está medido:** la moderación
(`apply_business_verification_state`) reactiva con
`update businesses set is_active = (new.verification_status = 'approved')`, así que
**aprobar un negocio sin dueño vivo aborta la aprobación**. La API traduce el `R0002`
a un **422** con el mensaje de la base y con la puerta que lo resuelve
(`apps/api/src/modules/businesses/businesses.service.ts`, `mapBusinessWriteError`), y la
salida es la de la plataforma: devolverle el dueño primero.

### B.5 — El retiro de `business_ownership`

**La tabla ya no existe.** Medido en la base viva el 2026-10-21, sólo `SELECT`:
`to_regclass('public.business_ownership')` → `NULL`; `pg_class` en `public`: **43**
tablas (eran 44); `pg_policies` que nombran la tabla: **0**; `pg_proc` que la nombran:
**0**; policies de `public`: **112** (eran 133: 133 − 19 − 2).

**Las diecinueve policies que se retiraron**, en doce tablas — la lista se midió contra
`pg_policies` **antes** de escribir la migración, y la migración las borra **por
nombre**, una por una:

| tabla | policy | cmd |
| --- | --- | --- |
| `business_hours` | Owners can manage own business hours | ALL |
| `business_locations` | Owners can manage own business locations | ALL |
| `business_notification_preferences` | Business owners insert own notification preferences | INSERT |
| `business_notification_preferences` | Business owners update own notification preferences | UPDATE |
| `business_notification_preferences` | Business owners view own notification preferences | SELECT |
| `businesses` | Owners can update own businesses | UPDATE |
| `businesses` | Owners can view own businesses | SELECT |
| `coupons` | Owners can manage own coupons | ALL |
| `offer_categories` | Owners can delete offer categories | DELETE |
| `offer_categories` | Owners can insert offer categories | INSERT |
| `offers` | Owners can delete own offers | DELETE |
| `offers` | Owners can insert own offers | INSERT |
| `offers` | Owners can update own offers | UPDATE |
| `offers` | Owners can view own offers | SELECT |
| `order_events` | Business can view own order events | SELECT |
| `orders` | Business can view own orders | SELECT |
| `payment_intents` | Business can view own payment intents | SELECT |
| `payouts` | Business can view own payouts | SELECT |
| `profiles` | Businesses can view their order customers | SELECT |

Las **dos** policies de la propia tabla —«Owners can view own business ownership» y
«Admins can view all business ownership»— **no están en la lista porque no nombran la
tabla en su predicado** (`owner_id = auth.uid()` y `my_role() = 'admin'`): caen con
ella.

**Los lectores que se mudaron.** Los **cinco** de la API, que eran los que la
auditoría del Plan 2 había contado:

| # | lector | ahora |
| --- | --- | --- |
| 1 | `businesses.repository.ts` · `aggregateSelect` | un `inner join lateral` correlacionado sobre `business_members`, con preferencia por el dueño **vivo** |
| 2 | `businesses.repository.ts` · `insert` | escribe **sólo** la membresía de dueño |
| 3 | `auth-account.repository.ts` · `countRetained` | `businesses` sale de las membresías de dueño vivas |
| 4 | `announcements.repository.ts` · `ownerIdsForBusinesses` | `business_members` con tres filtros: rol, estado y no archivada |
| 5 | `notification.handlers.ts` · `onOrderStatusChanged` | `inner join business_members` con `role='owner'`, `status='active'`, `deleted_at is null` |

Y el **sexto**, que no estaba en la lista del Plan 2 y que era el ítem 1 de la
herencia: el **móvil** (`apps/mobile/src/features/business/data/repository.ts` ·
`getBusinessesByOwnerId`), que ahora lee `business_members` y deduplica los ids.

**Las dos funciones que NO estaban en el plan y que también la leían** — y que
habrían reventado producción en silencio:

- `public.notify_business_pending()` — corre en el `AFTER INSERT` de `businesses`.
- `public.notify_business_verification()` — corre en el `AFTER UPDATE OF
  verification_status` de `business_moderation`.

Una función de plpgsql que nombra una tabla que ya no está **no falla al compilar:
falla al ejecutarse**, con `relation "business_ownership" does not exist`. Lo que eso
significa: **TODOS los altas de negocio** —del móvil y del API— y **TODAS las
aprobaciones y rechazos** de la moderación habrían empezado a fallar. Ninguna de las
dos es un permiso: son **reglas de existencia** (quién es el dueño, para poder
avisarle), y la reescritura conserva la semántica exacta: la membresía viva es la
misma definición que usa `public.business_member_role`, y el `left join lateral`
conserva el `left join` viejo —un negocio sin dueño vivo deja el correo en `NULL`, que
es lo que pasaba cuando la fila de propiedad no estaba—.

**Y un séptimo lector que ninguna comprobación de base de datos puede ver:** la Edge
Function `handle-order-event` (`supabase/functions/handle-order-event/index.ts`), que
es la que dispara el trigger `trg_order_event_push` en cada `order_events` INSERT. No
es una función de Postgres —es PostgREST desde Deno—, así que ni `pg_proc.prosrc` ni
`pg_policies` la ven. Ese lector se mudó en la Task 11, con el mismo patrón de
membresía viva que los otros cinco lectores de la API. Ver §B.7.

**Lo que se conserva de la generación vieja, y por qué no se nota:** las dos
generaciones de policies coexistieron durante el Plan 3, y su equivalencia era **para
un dueño con la sesión viva**, y sólo esa —la generación vieja no miraba el TTL—. Con
la tabla caída, la paridad deja de ser un estado transitorio y pasa a ser el estado
final: ya no hay dos respuestas a «¿esta persona es el dueño?».

### B.6 — Lo que se dejó fuera a propósito, y por qué

Cada línea es una cosa que **podía** haberse hecho y no se hizo, con su razón:

| lo que no se hizo | por qué |
| --- | --- |
| **La pantalla del panel** (admin y móvil) que llama a las dos rutas nuevas | la API existe; el botón no. La interfaz de «Equipo» y las dos pestañas de admin son un plan aparte (§9.2 y §10 del spec) |
| **La pantalla de admin que muestra los negocios sin dueño** | la base los hace imposibles de reactivar sin dueño, así que el estado es raro y explícito; **verlo** en una tabla del panel es otra historia |
| **El login condicional del §9.1** (los chips de cuentas, el «¿olvvidaste tu contraseña?» para `.role.ec`, el escáner de la tarjeta) | es un plan aparte del móvil; el Plan 3 sólo deja `isRoleEcAlias` viva, como el §A.4 pide |
| **El filtrado de configuración por rol mínimo del §9.3** | es UI, y el §9.3 ya decidió que el filtrado es de UI. Lo que el Plan 3 hizo fue lo que el §9.3 no podía hacer: que la **base** acote al gerente |
| **El alias editable y su aviso** (§9.4) | el §9.4 y el §A.4 ya están construidos en `packages/commons`; lo que falta es la pantalla |
| **La edición de alias desde la app** y la tarjeta de entrega con QR | idem |
| **La eficiencia del helper de alcance** (el acantilado de ~328 µs por fila) | medido y escrito en `supabase/migrations/README.md`. El lever es el costo por fila del helper, y no urge antes de que un negocio se acerque a 1.000 pedidos. **Este plan no optimiza ese costo** |
| **El `Seq Scan on orders`** dentro del subplan hasheado de la policy de `profiles` | es un eje de tabla, medido y anotado; el Plan 3 no cambia la forma de esa policy más que por el predicado que ya usaba |
| **Facturación, planes y `visibility_plus`** (§12 del spec) | fuera del alcance del spec desde el principio |
| **El borrado físico de membresías** (§12) | sigue siendo lógico, y ahora además es lo que hace posible borrar un negocio liberado |
| **Una tabla de auditoría de propiedad** | el repo **no tiene** una tabla de auditoría de negocio (`order_events` es de pedidos). Una tabla de auditoría es un esquema nuevo que nadie pidió y que nadie lee. Lo que hay es el **log estructurado**, con un `event`: `business_ownership_transferred`, `business_ownership_restored`, y los del resto de las operaciones del equipo. Si el negocio necesita un historial **consultable**, es una tabla y es una decisión de producto — **ver §B.7** |
| **Adoptar `R0003`** | el panel no lo conoce y este plan no toca el panel. La transferencia usa `R0004`, un código **nuevo**, así que `R0001` sigue significando exactamente las dos cosas que significa hoy (el tope y la entitlement) |
| **Un bucket de throttler propio para las rutas nuevas** | el tope global (100/min/IP) las cubre, y la presión sobre GoTrue viene de `createUser`, que este plan no agrega a una ruta nueva: la recuperación crea el acceso por la puerta que ya existe |
| **Un round-trip menos por lectura de pedido** (`roleOf`) | es un ítem de performance, con el mismo lever que el acantilado |
| **Renombrar los eventos de analítica** (`business_ownership_transferred`, `business_ownership_restored`) | dicen «ownership», que era el nombre de la tabla, pero renombrarlos **parte los tableros**: es una decisión de producto, no de este plan |
| **Recuperar la fila de propiedad histórica** | la tabla se cayó con sus datos. **El dueño vive en `business_members`, que no se tocó** —16 negocios, 16 membresías, 16 dueños vivos—, así que los negocios **vuelven a tener dueño**; lo que se pierde es el **histórico de propiedad** |

### B.7 — Cuatro decisiones que quedan ABIERTAS, y su costo

Ninguna se decidió acá. Se registran con lo que cuesta decidirla, para el partner.

1. **Un gerente que crea una sucursal no la administra hasta que el dueño se la da.**
   Crear una sucursal es una operación de negocio entero —la fila que se crea no está en
   el alcance de nadie— y administrar es del alcance. **El costo de la decisión:** o el
   dueño tiene que poner cada sucursal nueva en el alcance de alguien (una acción
   manual por sucursal, y un negocio con veinte sucursales la tiene que hacer veinte
   veces), o la creación pasa a ser «de alcance», que es una tercera semántica para
   `business_locations` y toca la policy de `INSERT` y la del helper.
2. **El dueño saliente conserva el alcance de TODAS las sucursales, como `manager`.**
   Es lo que dice D1 y lo que la transferencia hace: el ex-dueño no pierde el panel de
   un día para otro. **El costo de la decisión:** «entregar el negocio» deja al que se
   va con acceso de gerente sobre **todo** el negocio, no sobre lo que la otra persona
   le ceda. La alternativa —dejarlo sin alcance— es más limpia, pero rompe el panel del
   que se va el mismo día de la entrega, que es exactamente lo que D1 quiso evitar.
3. **No hay tabla de auditoría.** Las transferencias y las asignaciones emiten un
   **log estructurado** con un `event` (`business_ownership_transferred`,
   `business_ownership_restored`), y nada más. **El costo de la decisión:** no hay
   historial **consultable** de quién fue dueño de un negocio y cuándo. Si el negocio
   lo necesita —para un reclamo, para unaimpitación, para un due diligence— es una
   tabla nueva, con su schema, sus policies y su retención, y es un plan aparte.
4. **`R0003` sigue sin adoptarse.** La transferencia y la liberación usan `R0004`, un
   código nuevo, y `R0001` sigue significando **dos** negativas: el tope de plan y la
   entitlement `staff_access`. **El costo de la decisión:** el panel tiene que leer el
   `detail` —que es prosa— para distinguir «te pasaste de miembros» de «tu plan no
   trae la feature». Adoptar `R0003` es un cambio de un solo lado en la API
   (`PG_PLAN_LIMIT` y `mapWriteError`) **más el mapeo del panel**, que es donde de
   verdad se nota.
