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
   **Esta es una decisión que aplaza su propia implementación al Plan 2, y no un
   inventario de código que exista.** Al cierre de este plan
   `apps/api/src/modules/staff/` **no existe**: las nueve rutas de abajo —ocho bajo
   `@Controller('businesses/:businessId/staff')` más `POST /staff/session`— están
   especificadas, no construidas, y el cliente HTTP del panel que las consumiría
   tampoco. Lo que existe es la capa que las va a necesitar: las 24 policies que
   resuelven por estos helpers, los tres RPCs recreados con el helper y las cuatro
   medidas que el módulo va a tener que respetar.
   Se listan igual porque la excepción es a la **arquitectura** y hay que poder
   razonar sobre su alcance antes de que exista: cuando llegue, el cliente HTTP del
   panel se limitará a esa pantalla —listar, dar de alta, editar, rotar PIN, pausar,
   reactivar, eliminar y sellar la sesión de entrada—. Todo lo demás —catálogo,
   pedidos, sesiones, preferencias— sigue yendo directo a Supabase con RLS como
   frontera, sin cambiar.

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