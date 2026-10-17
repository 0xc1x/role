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

- [ ] **Step 1: Verificación completa**

```sh
bun run typecheck
bun run test
bun run build
```

Los tres en verde, salvo lo que ya estaba rojo en `main` en `5534b6d`: los 3 fallos de
`catalog-rpc-moderation-gate` contra la migración de septiembre, y los 7 timeouts de
`bug-report-inbox` cuyo verificador de token marca `127.0.0.1:9`.

- [ ] **Step 2: El addendum del ADR**

§7 y §8 del spec describen nueve rutas que hasta acá no existían. El ADR dice que el móvil
consulta la API únicamente para administrar quién opera —una **decisión**— y después de
este plan eso ya tiene una implementación detrás. Actualizarlo es lo que separa "se decidió"
de "se construyó", y es la diferencia que va a leer el próximo que retome esto.

- [ ] **Step 3: Lo que Plan 3 hereda**

Actualizar la lista de fuera de este plan con lo que este plan dejó abierto:

- `getBusinessesByOwnerId` y el `drop table public.business_ownership` con sus 19 policies.
- El acantilado de performance, con su eje por negocio.
- El `Seq Scan on orders` de la policy de `profiles`.
- El guard que compara `BUSINESS_PLAN_LIMITS` contra los triggers, que pasa a ser la única
  costura entre el número que ve el dueño y el que aplica el motor.