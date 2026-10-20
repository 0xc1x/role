# Plan 2 — Contratos y API de accesos de staff

> Alcance: lo que hace que un dueño pueda, de verdad, dar de alta a un cajero y decirle
> a qué sucursal pertenece. El Plan 1 lo dejó todo en la base; este plan lo consume.
> base lista: `business_members`, los helpers de permiso, 25 policies y los topes de plan.
> Este plan no cambia el modelo de datos; lo consume.

## Por dónde empieza, y por qué

La revisión de rama del Plan 1 dejó dos cosas que Plan 2 no puede esquivar, porque Plan 2
abre la puerta de escritura que las vuelve urgentes:

1. **`role = 'owner'` no lo medía nadie.** `trg_enforce_member_limit` es el único trigger
   sobre `business_members`, y salta el conteo cuando `new.role = 'owner'`. Un negocio en
   su tope podía promover staff a owner e insertar más, indefinidamente. Además no había
   índice único de un owner por negocio, y borrar lógicamente a un owner estaba permitido —
   §5.4 dice que ningún rol puede desactivar al dueño, y nada lo decía en la base.
2. **Los límites de plan hablaban en prosa dentro de `P0001`.** La UI que quisiera ofrecer
   "subir a Pro" tendría que regexear una frase en español.

Ambas se resuelven **antes** de escribir una línea de API, y por la razón que §6.3 ya
estableció: la frontera es RLS y la base, no el servicio. Un guard de Nest cubre la puerta
que el equipo conoce; una escritura por `service_role` desde un script o un panel futuro se
lo salta sin que nada se ponga rojo.

### Decisiones tomadas (partner, 2026-10-16)

- **El alta nunca crea un owner.** `POST /staff` crea `manager | staff`. El owner es quien
  creó el negocio y ya existe por el backfill del Plan 1. Esto cierra de raíz la vía de
  escape de cupos y vuelve "un owner por negocio" un hecho, no una convención.
- **El invariante del owner se impone en la base**, no solo en la API: índice único parcial
  más un trigger que niegue el `deleted_at` y el `status = 'disabled'` sobre una fila de
  owner.

Medido antes de escribir nada: 16 owners en 16 negocios distintos, ninguno con dos. El
índice parcial aplica limpio sobre producción.

### Fuera de este plan

- **Plan 3 — Mobile y admin.** Los cuatro cambios del login, la sección Equipo del panel, el
  filtrado de configuración por rol mínimo, la edición de alias desde la app, las dos
  pestañas de admin, y —con lo que este plan lo habilite— migrar `getBusinessesByOwnerId`
  al modelo de membresía y recién ahí dropear `business_ownership` con sus 19 policies.
- **El acantilado de performance.** Quedó medido y escrito en `supabase/migrations/README.md`:
  ~328 µs por fila en el camino de miembro, eje por negocio. El lever es bajar el costo por
  fila del helper o sacar la expresión por fila de una función `security definer`; ninguno
  urge antes de que un negocio se acerque a 1.000 pedidos.
- **El `Seq Scan on orders` dentro del subplan hasheado de la policy de `profiles`**, que
  ignora `idx_orders_user`. Es un eje de tabla, medido y anotado, y no lo arregla este plan.

### Lo que Plan 3 hereda de este plan, ítem por ítem

Esta lista es el contrato de cierre del Plan 2: lo que este plan dejó abierto, con el
archivo donde se ve. Lo que no está acá está resuelto y sellado.

**Lo que ya estaba en la lista del brief**

1. **`getBusinessesByOwnerId` y el `drop table public.business_ownership` con sus 19
   policies.** El único consumidor que todavía lee la tabla vieja está en el móvil:
   `apps/mobile/src/features/business/data/repository.ts:352`
   (`getBusinessesByOwnerId`, llamado desde `apps/mobile/src/features/business/hooks.ts:27`).
   Plan 3 lo migra al modelo de membresías **primero**, y recién ahí la tabla se dropea.
2. **El acantilado de performance**, con su eje por negocio: ~328 µs por fila en el camino
   de miembro. Medido y escrito en `supabase/migrations/README.md`.
3. **El `Seq Scan on orders`** dentro del subplan hasheado de la policy de `profiles`,
   que ignora `idx_orders_user`.
4. **El guard que compara `BUSINESS_PLAN_LIMITS` contra los triggers**
   (`apps/api/src/database/security/plan-limits.db.spec.ts`), que pasa a ser la **única**
   costura entre el número que ve el dueño y el que aplica el motor. Se vuelve más
   importante, no menos: el Plan 2 agrego una segunda fuente de plan —la feature
   `staff_access`— que también vive en el catálogo de TypeScript.
5. **El QUINTO lector de `business_ownership`** —los otros cuatro son `aggregateSelect`,
   `insert`, `countRetained` y `announcements.ownerIdsForBusinesses`, y ninguno es una
   comprobación de permiso—:
   `apps/api/src/modules/notifications/notification.handlers.ts:36-39` hace un `INNER JOIN`
   contra la tabla como REGLA DE PRESENCIA. Un negocio sin fila de propiedad devuelve cero
   filas, el `if (!row) return;` se come el handler entero y NO SE AVISA NI AL CONSUMIDOR NI
   AL NEGOCIO: sin error y sin log. Plan 3 tiene que moverlo al modelo de membresías
   ANTES de dropear la tabla; si no, todas las push del negocio mueren en silencio. El test
   que pinan el comportamiento de hoy está en `notification.handlers.spec.ts` —«un negocio SIN
   fila en `business_ownership` no notifica a nadie»— y es el que tiene que cambiar cuando
   el lector se mueva.

**Lo que este plan agregó y todavía está abierto**

6. **La transferencia de propiedad NO EXISTE, y por eso un dueño no puede irse.** Es el
   ítem de mayor prioridad de Plan 3 y es un **hueco de producto**, no limpieza. Con el
   dueño inmutable (`20261020052915_owner_cannot_be_demoted.sql` y
   `apps/api/src/modules/staff/staff.service.ts:439-443`), un dueño **—de un negocio
   activo o no—** **no puede borrar su cuenta por ninguna vía**: `DELETE /auth/account`
   contesta 409 (`apps/api/src/modules/auth/auth.service.ts:691-746`), degradarse contesta
   422/R0002, y darse de baja o pausarse también. La puerta cuenta membresías de dueño
   **vivas** (`countRetained`,
   `apps/api/src/modules/auth/auth-account.repository.ts:112-121`) y **no mira
   `businesses.is_active`**: desactivar el negocio **no** abre la salida, y borrarlo
   tampoco —la cascada `business_members_business_id_fkey` dispara el trigger del dueño
   con `R0002`. El addendum §A.2 del ADR-0013 lo dice entero.
   Mientras la transferencia no exista, un dueño que quiere dejar su negocio no tiene
   salida: o se queda, o resuelve el caso por fuera de la API.
7. **Un dueño legacy que sólo vive en `business_ownership` todavía borra su cuenta en
   silencio.** La puerta del borrado lee `owner_memberships`, y ese número sale de
   `business_members` y de **nada más**
   (`apps/api/src/modules/auth/auth-account.repository.ts:99-131`). `businesses` —el conteo
   de `business_ownership`— alimenta sólo la rama de `anonymise`, nunca la del 409. Un
   dueño cuya fila de propiedad no tenga fila de membresía obtiene `owner_memberships = 0`,
   no hay 409, y la cuenta se anonimiza dejando `business_ownership.owner_id` apuntando a
   un perfil recién anonimizado: el negocio queda sin nadie que lo administre, en silencio.
   **Verificado contra la base viva el 2026-10-20: hoy NO hay ninguna fila así** —16 filas
   en `business_ownership`, 16 membresías de dueño vivas, 0 y 0 en los dos cruces—, así que
   el daño es **latente**, no de datos perdidos hoy. Sigue siendo un riesgo vivo en
   cuanto exista una fila de esas (una creada antes del backfill del Plan 1, o por un
   camino que escriba la tabla vieja sin la membresía). Plan 3 lo cierra con un backfill.
8. **La combinación de «vencida» está duplicada en TypeScript.**
   `apps/api/src/database/business-membership.ts:87-98` (`sessionInsidePromise`) escribe la
   COMBINACIÓN de las dos mitades —`ttl = 0` OR `sello is not null AND expira >= now()`—
   en el `.ts`. La **aritmética** sí es de la base
   (`public.business_member_session_expires_at`), y el guard de catálogo lee
   `pg_proc.prosrc` (`apps/api/src/database/security/plan-limits.db.spec.ts`), así que
   **no puede ver un `.ts`**: una migración que cambie la definición de «vencida» en SQL
   desincroniza la API en silencio. La mitigación concreta existe y está escrita: una
   función SQL con los dos parámetros explícitos, como la que ya hay para `staff`.
9. **`R0001` ahora cubre DOS negativas distintas**: el tope de plan (los triggers) y la
   entitlement `staff_access` (la API, `staff.service.ts:1235-1244`). El panel conoce una
   sola respuesta de plan y eso es lo que se quiso, pero el código ya no dice *por qué*
   se negó: la UI tiene que leer el `detail`, que es prosa, para distinguir «te pasaste de
   miembros» de «tu plan no trae la feature». Si se elige `R0003` —que es lo que pidió un
   revisor—, el cambio es de un solo lado en la API (`PG_PLAN_LIMIT` y `mapWriteError`)
   **más el mapeo del panel**, que es donde de verdad se nota. Ver §A.3 del ADR-0013.

**Lo que las revisiones marcaron «Minor» o «needs partner» y sigue abierto**

10. **La contención del `manager` sólo la aplica esta API, y para las operaciones que RLS
    concede no es una frontera.** `can_manage_location` da el negocio entero al `manager`
    lo mismo que al `owner` (`when r.member_role in ('owner','manager') then true`,
    verificado en la base viva el 2026-10-20), y ese helper es lo que resuelven **cuatro
    policies de escritura**: `Members can insert own offers`,
    `Members can update own offers` y `Members can delete own offers` (las tres con
    `can_manage_location(business_id, business_location_id)`) y
    `Members can update business locations` (con `can_manage_location(business_id, id)`).
    **Un `manager` acotado a la sucursal A puede, por PostgREST, editar y borrar los
    productos de la sucursal B y renombrar la sucursal B.** El `assertWithinReach`
    (`staff.service.ts:938`) lo impide **en esta API y sólo en esta API**: es un predicado
    de TypeScript, y como el móvil escribe directo a Supabase (ADR-0002), la contención del
    §8 **no es una frontera de seguridad para esas operaciones**. A eso se suma la lectura:
    la policy `Owners and managers view business members` deja que cualquier gerente lea
    todos los alias del negocio, así que «un `manager` no ve los accesos de sucursales que
    no gestiona» **no está garantizada en el cliente**. La revisión de la Task 3 lo pidió
    antes de que el panel exista; sigue sin decidir, y el costo **no es sólo de
    *disclosure*: es de escritura sobre el catálogo**.
11. **La rama de admin de plataforma de `GET /staff` no está acotada.**
    `staff.service.ts` —el `user.role === 'admin'`— sirve el roster de **cualquier**
    negocio a **cualquier** `app_role='admin'`, sin comprobar que el negocio exista (un id
    desconocido contesta 200 con `[]`) y sin poder acotar el admin a los negocios que
    supervisa. Expone el `alias`, que espeja `auth.users.email`. Está deliberadamente
    pineado por un test, pero la revisión de la Task 4 lo dejó explícitamente «para el
    partner»: o el panel de admin lee esto por la API (y la forma es correcta), o debería
    leer Supabase directo como el del dueño (y la rama sobra).
12. **El aviso de «tu dirección cambió» sigue encolándose a la dirección actual sin
    comprobar la entregabilidad.** `apps/api/src/modules/auth/auth.service.ts` —
    `enqueueEmailChangeNotice({ to: current.email })`. Una cuenta cuya dirección actual es
    un alias generado encola un envío a una bandeja que no existe. No lo arregla este plan
    porque §8 nombra los dos endpoints que rechazan el **identificador enviado**, no el
    actual; y el rebote cae en nuestro propio dominio, no en el del negocio.
13. **La propiedad «la cascada no destruye una membresía» vive sólo en el servicio.**
    `AuthAccountRepository.eraseAccount` (`auth-account.repository.ts:319`) no tiene guarda
    de membresía propia: si se llamara sin la puerta, la cascada borraría una fila de
    `staff` (el trigger sólo protege las filas de **dueño** vivas) y reciclaría el alias.
    Hoy hay un solo llamador y está detrás de la puerta, así que es defensa en profundidad,
    no un bug vivo.
14. **El borrado archiva la membresía pero no sus filas de alcance.**
    `auth-account.repository.ts:237` (`anonymise`) escribe `deleted_at` en
    `business_members` y **no** en `business_member_locations`, que el §8 sí pide («marca
    `deleted_at` en `business_members` y en sus filas de `business_member_locations`»). Las
    dos tablas quedan discrepando sobre qué significa `deleted_at`.
15. **El servicio escribe `role: 'staff'` explícitamente** (`staff.service.ts:310` y `:367`),
    así que el default de la columna —que el contrato dice que es «la única copia de esa
    decisión»— es una segunda copia.
16. **El 404 «Negocio no encontrado» es inalcanzable** (`staff.service.ts:319`):
    `requireActor` corre antes y rechaza a cualquiera que no tenga membresía en un negocio
    que no existe. El test que lo cubre pasa porque los mocks dan una membresía en un
    negocio inexistente, un estado imposible.
17. **La compensación del alta es best-effort.** `staff.service.ts` —
    `compensateCreatedUser`: si `deleteUser` falla, el `auth.users` sobrevive con el alias
    quemado en Auth y libre en la base, y el reintento del dueño recibe un 409 «ese alias
    ya está en uso» sin salida. El huérfano queda en el log, pero el mensaje al dueño no
    dice «y la cuenta puede seguir existiendo».
18. **El alcance vacío del que llama no está documentado ni testeado.**
    `assertWithinReach` (`staff.service.ts:939`) admite que un `manager` **sin filas de
    alcance** cree un acceso sin alcance; el fixture del spec siempre le da
    `[LOC_A, LOC_B]`. RLS le da el negocio entero, así que el caso es peor de lo que
    parece.
19. **Las nueve rutas no tienen bucket de throttler propio.** El tope global existe
    (100/min/IP), pero `POST /businesses/:id/staff` llama `auth.admin.createUser`, que cae
    bajo el rate limit de GoTrue. El §13 dice que «el API tiene throttler propio en las
    rutas de gestión»; `orders` y `upload` ya lo tienen.
20. **Un round-trip más por lectura de pedido.** `roleOf` es una segunda consulta en
    `GET /orders/:id` (`apps/api/src/modules/orders/orders.service.ts`, `resolveAccessibleOrder`
    y `updateStatus`). Correcto, pero son dos idas a la base por pedido.
21. **El test del token forjado afirma sólo el status** (`staff.controller.spec.ts`), así que
    no distingue el 401 del verificador real del 401 del stub de perfil. La afirmación es
    cierta de hecho; la aserción no la fija.
22. **El módulo no afirma el provider del `service_role`.**
    `apps/api/src/modules/staff/staff.module.spec.ts` afirma `StaffService` y
    `StaffRepository`, pero no `STAFF_AUTH_ADMIN` —que es el cliente `service_role`, la
    razón de que el módulo exista—. Borrar ese provider deja la suite verde y la app no
    arranca.

### Lo que Plan 2 hereda como decisión, no como hallazgo

- Los números `1/2/5/20` viven hoy en SQL y en `BUSINESS_PLAN_LIMITS`, con un guard que los
  compara. Ese guard debe seguir verde después de este plan: si la API empieza a leer el
  catálogo de TypeScript, ese test pasa a ser la única costura entre lo que ve el dueño y
  lo que aplica el motor.
- La equivalencia entre las dos generaciones de policies es **para un dueño con la sesión
  viva**, y solo esa. Cualquier cosa que Plan 2 escriba tiene que publicizede que la capa
  que decide es la de membresías.

---

### Task 1: La base impone sus propias reglas

**Files:**
- Create: `supabase/migrations/<version>_owner_is_untouchable.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members` (Plan 1), los triggers de límite (Plan 1).
- Produce: un owner por negocio, y un owner que no se desactiva ni se borra.

La primera tarea del plan no es un contrato de TypeScript sino una regla de la base, porque
es la regla que Plan 2 va a necesitar para no abrir un agujero el mismo día que publique.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
test('un negocio no puede tener dos dueños', async () => {
  const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`insert into public.business_members
      (business_id, user_id, role, label, alias)
      values ('${BIZ_A}', '${USER_9}', 'owner', 'Co-owner', 'co@x.role.ec')`),
  );
  expect(err?.code).toBe('23505');
});

test('al dueño no se lo desactiva', async () => {
  const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`update public.business_members set status = 'disabled'
      where business_id = '${BIZ_A}' and role = 'owner' and deleted_at is null`),
  );
  expect(err?.message).toContain('dueño');
});

test('al dueño no se lo da de baja', async () => {
  const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`update public.business_members set deleted_at = now()
      where business_id = '${BIZ_A}' and role = 'owner' and deleted_at is null`),
  );
  expect(err?.code).toBe('P0001');
});
```

También: un `manager` o `staff` **sí** se puede desactivar y dar de baja — el trigger tiene
que distinguir el rol, no negarle la fila entera.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: FAIL — nada de esto está todavía.

- [ ] **Step 3: Escribir el índice y el trigger**

```sql
create unique index business_members_one_owner_per_business
  on public.business_members (business_id)
  where role = 'owner' and deleted_at is null;
```

Índice **parcial**, y no único sobre `(business_id, role)`: el objetivo es un owner
*activo* por negocio, y un owner dado de baja deja de contar para que la fila siga siendo
historia — que es lo que §8 pide del borrado.

El trigger va `before update`, no `before insert or update`: en el `insert` la unicidad ya
la garantiza el índice, y un trigger que solo mira la transición no estorba al backfill ni a
ninguna recarga.

```sql
create or replace function public.enforce_owner_is_untouchable()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if old.role <> 'owner' then
    return new;
  end if;
  if new.role <> 'owner' and new.deleted_at is null and old.deleted_at is null then
    return new;                        -- degradar un dueño no lo desactiva
  end if;
  if new.status = 'disabled' then
    raise exception 'el dueño del negocio no se puede desactivar; degradalo a manager o manager primero';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'el dueño del negocio no se puede dar de baja; degradalo primero';
  end if;
  return new;
end $fn$;
```

La degradación —`owner` → `manager`— pasa, y tiene que pasar: es la única salida que §5.4
deja ("ningún rol puede desactivar al dueño") y la que va a necesitar la transferencia de
propiedad cuando exista. Lo que no pasa es que esa fila quede sin dueño.

- [ ] **Step 4: Los límites de plan, legibles por máquina**

Los dos triggers de `20261015034230` levantan `P0001` con la prosa dentro. Reescribirlos
con código estable, sin perder un ápice del texto:

```sql
raise exception using
  errcode  = 'R0001',
  message  = format('el plan % admite hasta % miembros, no más', v_plan, v_limit),
  detail   = format('business=%s plan=%s limit=%s current=%s',
                    new.business_id, v_plan, v_limit, v_despues),
  hint     = 'subí de plan o gestioná el acceso que ya existe';
```

`R0001` es el espacio del dominio: los errores de negocio de esta base llevan prefijo `R`
y `P0001` es la clase genérica de Postgres. La UI necesita dos cosas distintas: el código
para *qué hacer* y el `detail` para *qué pasó exactamente*.

Los códigos que la base emite, y que la Task 4 tiene que mapear a una acción de UI:

| errcode | significado | qué le dice la UI |
| --- | --- | --- |
| `R0001` | límite de plan alcanzado | "subí de plan", con el plan y el tope en `detail` |
| `R0002` | el dueño no se puede desactivar ni dar de baja | "degradalo a manager primero" |

- [ ] **Step 5: Cerrar los `revoke`**

`20261015034230:305-307` revoca de `public, anon` y no de `authenticated`. Hoy no importa
—`pg_default_acl` del proyecto ya da `{postgres, service_role}`— pero un default que se
amplíe en algún momento abriría los triggers a `authenticated` sin que nadie lo pidiera.
Agregar `authenticated` a la lista lo vuelve indefenso por sí mismo.

- [ ] **Step 6: Correr, aplicar, sellar y commitear**

```bash
git commit -am "feat(db): un dueño por negocio, y ningún rol lo desactiva"
```

---

### Task 2: Los contratos en `packages/commons`

**Files:**
- Create: `packages/commons/src/business/enums/business-member-role.ts`
- Create: `packages/commons/src/business/enums/business-member-status.ts`
- Create: `packages/commons/src/business/schemas/business-member.schema.ts`
- Create: `packages/commons/src/business/dtos/business-member.dto.ts`
- Modify: `packages/commons/src/auth/schemas/auth.schema.ts` (+ `StaffSessionStateSchema`)
- Test: el spec que corresponda en `packages/commons`

**Interfaces:**
- Consumes: los enums de Postgres (`business_member_role`, `business_member_status`).
- Produce: lo que la API valida y lo que el móvil pinta.

`BUSINESS_PLAN_CODES`, `BUSINESS_FEATURES`, `BUSINESS_PLAN_LIMITS` y
`BUSINESS_PLAN_FEATURES` ya existen (`business-plan.ts`, Plan 1). Faltan los de membresía.

- [ ] **Step 1: Vocabularios**

`BUSINESS_MEMBER_ROLES = ["owner", "manager", "staff"]`,
`BUSINESS_MEMBER_STATUSES = ["active", "disabled"]`, con el patrón exacto de
`business-plan.ts`: el array `as const`, el `type`, y el objeto const con la forma que el
resto del paquete ya usa para el DTO.

- [ ] **Step 2: El schema de zod**

`label`, `role`, `status`, `session_ttl_hours`, `business_location_ids[]`, `alias`, más los
schemas de entrada que la API necesita: crear, editar, rotar. `alias` con validación de
formato y el aviso de dominio que §8 pide — que el schema exprese que un dominio distinto
de `.role.ec` es legítimo, y que por eso la respuesta lleva un aviso, no un error.

- [ ] **Step 3: El guard que falta**

`business_members` tiene dos vocabularios de enum y un `CHECK` que **no asserta nada en
ningún harness** — lo dejó anotado el Plan 1 y sigue abierto. Este es el momento: el
vocabulario de TypeScript y el de Postgres tienen que poder divergir en silencio, y no
deben.

Un spec que compare `BUSINESS_MEMBER_ROLES` contra `pg_enum` y
`BUSINESS_MEMBER_STATUSES` contra `pg_enum`, en la misma forma que
`plan-limits.db.spec.ts` compara los límites contra los triggers. Sin el, borrar
`visibility_plus` —o `manager`— deja todo verde y revienta las Tasks 3 y 4 de este plan.

- [ ] **Step 4: `StaffSessionStateSchema`**

`{ role, location_ids, expires_at, reason, business_ids }` con el vocabulario de `reason`
que la Task 4 del Plan 1 dejó así: `ok`, `no_membership`, `multiple_businesses`,
`disabled`, `session_expired`, `session_never_stamped`. La enumeración vive en la base; el
schema tiene que conocerla entera, y si mañana la base agrega un valor sin que el schema lo
siga, el schema es el que está equivocado.

- [ ] **Step 5: Verificar el radio de impacto**

`bun run typecheck` en la raíz. Este es el SSOT: un error acá compila en la API, en el
admin, en el landing y en el móvil.

---

### Task 3: El servicio de accesos

**Files:**
- Create: `apps/api/src/modules/staff/staff.service.ts`
- Create: `apps/api/src/modules/staff/staff.repository.ts`
- Create: `apps/api/src/modules/staff/staff.module.ts`
- Test: `apps/api/src/modules/staff/staff.service.spec.ts`

**Interfaces:**
- Consumes: `packages/commons` (Task 2), `service_role`, `supabase.auth.admin`.
- Produce: la lógica de negocio de los accesos, sin HTTP encima.

- [ ] **Step 1: La regla de contención del `manager`**

Es la regla más fácil de romper de este plan, y la que un guard ingenuo arruinaría. Un `manager`
puede tocar solo accesos **cuyo conjunto de sucursales esté contenido en el suyo**, y nunca
uno con `role = 'owner'`. "Contenido" es subconjunto, no intersección: un manager de A y B
no puede tocar a un staff de A y C, porque C está fuera de su alcance aunque A esté dentro.

Y el `manager` **no ve** en la lista los accesos de sucursales que no gestiona. No es un
filtro cosmético: el reveal del alias —que espeja el correo— es disclosure.

- [ ] **Step 2: El PIN**

`crypto.randomInt` server-side, entregado una sola vez. Nunca devuelto después. La
generación del PIN y la del `auth.users` son la misma operación, y si el alta de la
membresía falla se borra el `auth.users` creado — el mismo patrón compensado del onboarding
(`businesses.service.ts:114-157`).

- [ ] **Step 3: Rotar ≠ desactivar**

Son operaciones distintas y la UI lo dice, porque **un dueño que rota creyendo que cortó
acceso es el peor resultado posible de esta pantalla**. Rotar cambia el PIN y no cierra
sesiones abiertas. Desactivar es `admin.updateUserById(id, { ban_duration: '876000h' })`, que
sí mata las persistentes de tablet. El código tiene que hacer imposible confundirlas: dos
métodos con nombres que no se parezcan, y un test que afirme que rotar **no** toca el ban.

- [ ] **Step 4: Borrar es dar de baja, no borrar**

`deleted_at` en la membresía **y** en sus filas de alcance, más el ban del `auth.users`. El
alias no se recicla, y el conteo de "quién estuvo aquí" sigue siendo posible. El borrado
físico queda como operación separada y no expuesta en la v1.

- [ ] **Step 5: Editar el alias**

Actualiza `business_members.alias` y `auth.users.email` en la misma operación, validando
formato y unicidad. Si el dominio nuevo no termina en `.role.ec`, la respuesta incluye el
aviso de que ese correo puede recibir mensajes de verdad — que es información que el dueño
necesita y que solo él puede actuar. Tras cambiar el alias **el PIN no cambia**: son dos
datos independientes.

- [ ] **Step 6: Tests**

Sin HTTP todavía. Cubrir la contención del manager con el caso de subconjunto que la
distingue del caso de intersección, la entrega única del PIN, la compensación cuando falla
la membresía, y que ni una sola operación devuelva el PIN después de crearlo.

---

### Task 4: Las nueve rutas

**Files:**
- Create: `apps/api/src/modules/staff/staff.controller.ts`
- Test: `apps/api/src/modules/staff/staff.controller.spec.ts`

**Interfaces:**
- Consumes: el servicio (Task 3), `can_manage_location`.
- Produce: la superficie HTTP que el panel consume.

- [ ] **Step 1: El guard, reemplazado**

El guard de rol de negocio de Nest **se reemplaza** por `can_manage_location`. No por
`business_member_role`: el TTL de sesión es una promesa de §5.2 y esta API escribe con
`service_role`, donde RLS no aplica, así que si el guard no lo consulta, un dueño con la
sesión vencida administraría igual que uno con la sesión viva.

Esa es la razón por la que el servicio tiene que preguntar por la sesión en su propia
sesión y no confiar en que alguien más lo hizo: son dos contextos distintos con dos
fronteras distintas, y lo inaceptable es que diverjan.

- [ ] **Step 2: Las nueve rutas**

| Ruta | Quién |
| --- | --- |
| `GET /businesses/:id/staff` | owner, manager (acotado) |
| `POST /businesses/:id/staff` | owner, manager (acotado) |
| `PATCH /businesses/:id/staff/:memberId` | owner, manager (acotado) |
| `PATCH /businesses/:id/staff/:memberId/alias` | owner, manager (acotado) |
| `POST /businesses/:id/staff/:memberId/rotate` | owner, manager (acotado) |
| `POST /businesses/:id/staff/:memberId/disable` | owner, manager (acotado) |
| `POST /businesses/:id/staff/:memberId/enable` | owner, manager (acotado) |
| `DELETE /businesses/:id/staff/:memberId` | owner |
| `POST /staff/session` | cualquier miembro |

- [ ] **Step 3: El alta no crea owners**

`role` del cuerpo de creación acepta `manager | staff`. Un `owner` en el cuerpo es un
`422`, con un mensaje que diga por qué: el dueño es quien creó el negocio. El schema de
`commons` lo expresa, y la base lo vuelve imposible igual.

- [ ] **Step 4: `POST /staff/session` sella, y solo sella**

Actualiza `last_authenticated_at` del que pregunta. Devuelve el estado de sesión del §5.2.
Es la operación que hace que la columna que hoy está en `NULL` para todo el mundo empiece a
tener sentido, y la que el Plan 1 dejó anotada como la que faltaba.

---

### Task 5: `.role.ec` no recibe correo

**Files:**
- Modify: el endpoint de `change-email` de auth
- Modify: el endpoint de `forgot-password` de auth
- Test: sus specs

**Interfaces:**
- Produce: dos endpoints que rechazan identificadores de un dominio sin buzón.

- [ ] **Step 1: Los tests que fallan**

Un correo bajo `.role.ec` en `change-email` → `422`; el mismo en `forgot-password` → `422`.
Un alias de dominio propio **pasa** el flujo normal, porque su destinatario es real.

- [ ] **Step 2: Implementar, en los dos sentidos**

En ambos endpoints. Un alias de dominio propio no se toca, y el motivo de no bloquearlo es
justo el que hace legítimo el alias propio: el correo va a una bandeja que existe.

- [ ] **Step 3: El borrado de cuenta tiene que detachment, no cascada**

La cadena `auth.users → profiles → business_members` es toda `ON DELETE CASCADE`, y la
Task 1 puso un trigger `before delete` que levanta `R0002` sobre la fila de un dueño. El
efecto, verificado contra la base viva: **borrar la cuenta de un dueño rebota**, y no lo
detecta ningún test porque el fixture de replay no tiene filas de `business_members`.

Es una regresión a una función que ya existe y que es del derecho del usuario, así que no
se acepta como efecto secundario. El borrado físico de una membresía no es parte de la v1
(spec §8: "queda como operación separada, no expuesta"), de modo que lo que corresponde es
que el camino de borrado de cuenta **desacople la membresía antes de borrar el perfil**,
igual que ya hace con `order_events`: hay un test que se llama literal "the erase detaches
an order_events actor instead of failing", o sea que el patrón existe y este caso es el
mismo con un actor más.

Sin ownerless, la fila no se borra: se degrada o se da de baja lógicamente, y el alias
queda quemado como queman los demás. Lo que **no** puede ser es que la cascada dispare el
trigger y el borrado de cuenta falle sin explicación.

---

### Task 6: Una sola respuesta a "¿esto es mi negocio?"

**Files:**
- Create: el helper compartido
- Modify: `BusinessesRepository`, `OffersRepository`, `OrdersRepository`, `BusinessOwnerStatsService`

**Interfaces:**
- Produce: un predicado único, con cada llamador declarando qué exige.

- [ ] **Step 1: El helper, y lo que NO hace**

El helper responde **un hecho**: qué rol tiene quien pregunta en este negocio. No responde
"¿puedo?" — eso es de cada llamador, y por eso la consolidación no abre acceso a nadie por
accidente.

```ts
/** Qué rol tiene quien pregunta en este negocio. `null` si no es miembro. */
async roleOf(businessId: string): Promise<BusinessMemberRole | null>
```

- [ ] **Step 2: Cada llamador declara su exigencia**

`isOwner` sigue siendo owner-only para quien hoy lo es. Lo que cambia es que la respuesta
viene del modelo de membresías y no de `business_ownership`, para que cuando Plan 3
dropee la tabla vieja, **no haya una cuarta copia que cambiar**. Si un llamador necesita
`owner | manager`, lo dice con su propia condición sobre el helper.

Esta es la razón de la consolidación: no es limpieza, es que el mismo predicado no se
puede dejar escrito de tres maneras distintas. El comentario de
`businesses.service.ts:731-735` ya lo dice — "is this my business?" termina respondido de
tres maneras levemente distintas.

- [ ] **Step 3: Verificar que nadie amplió acceso**

Un test por llamador que afirme el resultado para owner, manager, staff y no-miembro,
**antes y después**. La consolidación que abre un permiso es una regresión, no una mejora.

---

### Task 7: Cierre

**Files:**
- Modify: `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`
- Modify: el plan y el spec si algo se movió

- [x] **Step 1: Verificación completa**

```sh
bun run typecheck
bun run test
bun run build
```

**Lo que el cierre midió (2026-10-20), con la línea base re-establishida.** El `main`
ya no está en `5534b6d`: está en **`d72386c`**, que es el padre directo de `5534b6d`
más un commit de marca que **no toca `apps/api`**. La línea base se midió en un
worktree aparte, en las **dos** versiones de `main`, y **sin la caché de turbo** —
que es la trampa: `bun run test` es `turbo run test && bun test supabase`, y la clave
de caché **no incluye** `VITE_API_URL` ni `EXPO_PUBLIC_SUPABASE_URL`, así que una
entrada verde cacheada en una máquina con `.env` local se reproduce como verde sin él.

| suite | `main` @ `5534b6d` | `main` @ `d72386c` | rama @ `099cb30` |
| --- | --- | --- | --- |
| `packages/commons` | 349 / 0 | 350 / 0 | 393 / 0 |
| `apps/landing` | 170 / **1** | 170 / **1** | 170 / **1** |
| `apps/admin` | 638 / **4** | 638 / **4** | 638 / **4** |
| `apps/mobile` | 734 / **3** | 734 / **3** | 734 / **3** |
| `apps/api` | 2481 / **10** | 2481 / **10** | 2772 / **10** |
| `bun test supabase` | 42 / 0 | 42 / 0 | 42 / 0 |

(pass / fail.)

- `bun run typecheck` → **verde**, 6/6, forzado sin caché.
- `bun run build` → **verde**, 4/4, forzado sin caché.
- `bun run test` → **rojo por 18 fallos, los 18 preexistentes y con los mismos
  nombres** en las tres columnas. **La rama no agrega ni un fallo y arregla ninguno.**

**La línea del brief —«los tres en verde salvo los 3 de `catalog-rpc-moderation-gate` y
los 7 timeouts de `bug-report-inbox`»— era incompleta, no falsa en el fondo pero sí
falsa en la forma:** hay **8 fallos más** fuera de la API (1 en `landing`, 4 en
`admin`, 3 en `mobile`) y **estaban en `5534b6d` igual que en `d72386c`**. Los tres de
`catalog-rpc-moderation-gate` y los siete timeouts de `bug-report-inbox` siguen siendo
los 10 de la API; su causa está identificada: el verificador de token de
`bug-report-inbox` apunta a `http://127.0.0.1:9` (el puerto de descarte) y el test de
`catalog-rpc-moderation-gate` es de texto sobre el ledger y falla contra la migración
de septiembre.

**Para reproducir la línea base hacen falta dos pasos que no son opcionales:**
`apps/api/drizzle/` está en `.gitignore` (sin él las specs de base revientan con
`ENOENT` y los números no significan nada) y `packages/commons` hay que
**construirlo** antes de correr `admin`, `landing` y `mobile` (sin su `dist` esos tres
paquetes dan 42, 11 y 52 fallos en vez de 4, 1 y 3).

- [x] **Step 2: El addendum del ADR**

§7 y §8 del spec describen nueve rutas que hasta acá no existían. El ADR dice que el móvil
consulta la API únicamente para administrar quién opera —una **decisión**— y después de
este plan eso ya tiene una implementación detrás. Actualizarlo es lo que separa "se decidió"
de "se construyó", y es la diferencia que va a leer el próximo que retome esto.

**Lo que se hizo** (`docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`):

- Se **corrigió** la afirmación que había quedado falsa: la decisión 3 decía que
  `apps/api/src/modules/staff/` «no existe» y que las nueve rutas estaban «especificadas,
  no construidas». Hoy existen. El párrafo ahora apunta al addendum y dice lo que sigue
  sin existir (el cliente HTTP del panel: Plan 3).
- Se agregó el **addendum «De «decidido» a «construido»»**, con §A.1 (las nueve rutas, con
  archivo), §A.2 (el rol del dueño es inmutable y **un dueño —de un negocio activo o no—
  no puede borrar su cuenta por ninguna vía**), §A.3 (la entitlement del plan se consulta en la API
  al crecer y se rechaza con `R0001`, con el costo de reusar el código escrito), §A.4
  (`isDeliverableAlias` vs `isRoleEcAlias`, y por qué `isRoleEcAlias` se conserva aunque
  no tenga llamador en producción) y §A.5 (el borrado de cuenta: 409 antes de la cascada, no
  un cambio de schema — la FK sigue siendo `ON DELETE CASCADE`).

- [x] **Step 3: Lo que Plan 3 hereda**

Actualizar la lista de fuera de este plan con lo que este plan dejó abierto:

- `getBusinessesByOwnerId` y el `drop table public.business_ownership` con sus 19 policies.
- El acantilado de performance, con su eje por negocio.
- El `Seq Scan on orders` de la policy de `profiles`.
- El guard que compara `BUSINESS_PLAN_LIMITS` contra los triggers, que pasa a ser la única
  costura entre el número que ve el dueño y el que aplica el motor.
- El QUINTO lector de `business_ownership` —los otros cuatro son `aggregateSelect`,
  `insert`, `countRetained` y `announcements.ownerIdsForBusinesses`, y ninguno es una
  comprobación de permiso—:
  `apps/api/src/modules/notifications/notification.handlers.ts:36-39` hace un `INNER JOIN`
  contra la tabla como REGLA DE PRESENCIA. Un negocio sin fila de propiedad devuelve cero
  filas, el `if (!row) return;` se come el handler entero y NO SE AVISA NI AL CONSUMIDOR NI
  AL NEGOCIO: sin error y sin log. Plan 3 tiene que moverlo al modelo de membresías
  ANTES de dropear la tabla; si no, todas las push del negocio mueren en silencio. El test
  que pinan el comportamiento de hoy está en `notification.handlers.spec.ts` —«un negocio SIN
  fila en `business_ownership` no notifica a nadie»— y es el que tiene que cambiar cuando
  el lector se mueva.

**Lo que se hizo:** la lista de arriba pasó a ser la sección **«Lo que Plan 3 hereda de este
plan, ítem por ítem»**, con **22 ítems** y el archivo de cada uno. Los cinco de arriba
quedaron como ítems 1 a 5, y se agregaron:

- **La transferencia de propiedad NO EXISTE** (ítem 6) — el más importante, y un hueco de
  producto: con el dueño inmutable, un dueño no puede irse por ninguna vía.
- **Un dueño legacy que sólo vive en `business_ownership` todavía borra su cuenta en
  silencio** (ítem 7) — la puerta lee `owner_memberships`, que sale de `business_members` y
  de nada más. Verificado contra la base viva: hoy no hay ninguna fila así (16/16, 0 y 0
  en los dos cruces), así que el daño es **latente**, no de datos perdidos hoy.
- **La combinación de «vencida» duplicada en TypeScript** (ítem 8) —
  `apps/api/src/database/business-membership.ts:87-98`; el guard de catálogo lee
  `pg_proc.prosrc` y no puede ver un `.ts`.
- **`R0001` cubre dos negativas** (ítem 9) — tope y entitlement; si se elige `R0003`, el
  cambio es de un lado en la API **más el mapeo del panel**.
- **Los Minor y «needs partner» de las cuatro revisiones que siguen abiertos** (ítems 10 a
  22), con archivo: la contención del `manager` que sólo aplica esta API y **no es una
  frontera para las cuatro policies de escritura que resuelve `can_manage_location`**; la
  rama de admin de plataforma de `GET /staff` sin acotar; el aviso «tu dirección cambió»
  que se encola a la dirección actual; la guarda de cascada que vive sólo en el servicio;
  el borrado que no archiva las filas de alcance; el `role: 'staff'` explícito; el 404
  inalcanzable; la compensación best-effort; el alcance vacío del que llama; el throttler
  que no existe; el round-trip extra por pedido; el test del token forjado; y el provider
  del `service_role` que el spec del módulo no afirma.

El informe con la verificación completa, el ledger y el barrido de las revisiones está en
`.superpowers/sdd/2026-10-16-business-staff-access-api/task-7-report.md`.