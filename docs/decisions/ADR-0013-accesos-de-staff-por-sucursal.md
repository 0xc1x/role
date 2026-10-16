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
   total. El permiso se resuelve en tres helpers SQL —`business_member_role(business_id)`,
   `can_manage_location(business_id, location_id)` y `business_has_feature(business_id, feature)`—
   que las policies y los RPCs invocan por igual, y las ~20 policies viejas se recrean
   contra esos helpers conservando el orden *nuevo primero, viejo después*: las dos
   generaciones de policies quedan conviviendo, y la equivalencia se verifica por paridad de
   predicados antes de que caiga la anterior.

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
   vieja y sus policies siguen vigentes, y eso es seguro porque las nuevas son equivalentes
   —verificado por paridad— y no porque haya dos modelos que convivan en paz sin
   que nadie los compare.

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
   El módulo `staff` de la API expone nueve rutas: ocho bajo
   `@Controller('businesses/:businessId/staff')` más `POST /staff/session`, y el cliente
   HTTP del panel se limita a esa pantalla: listar, dar de alta, editar, rotar PIN, pausar,
   reactivar, eliminar y sellar la sesión de entrada. Todo lo demás —catálogo, pedidos,
   sesiones, preferencias— sigue yendo directo a Supabase con RLS como frontera, sin
   cambiar.

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
  coexisten hoy y resuelven igual; la equivalencia está verificada por paridad, no por
  lectura. El retiro de `business_ownership` (y de sus policies) ocurre en el Plan 3, con
  `getBusinessesByOwnerId` ya migrado al modelo de membresía.
- **La escritura de `business_members` no la hace el cliente**, ni siquiera un `owner`: no
  hay policy de INSERT/UPDATE/DELETE y el alta necesita `service_role`. La ausencia de
  policy es lo que RLS sabe hacer, y es la respuesta.
- La API vuelve a preguntar lo mismo que RLS ya sabe responder (`can_manage_location`), pero
  lo pregunta **en su propia sesión y con `service_role`**, donde RLS no aplica: el service
  layer tiene que contestar por su cuenta. Es una segunda copia a propósito —son dos
  fronteras con dos contextos distintos— y lo que no es aceptable es que diverjan:
  el Plan 2 tiene que comparar `BUSINESS_PLAN_LIMITS` en `commons` contra lo que los
  triggers aplican en la base, porque si divergen el dueño ve un número que el motor no
  aplica.
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