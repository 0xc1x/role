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

> **[cerrado por el Plan 3 — 2026-10-21]** Los veintidós ítems tienen destino: **diez
> cerrados** (nueve por tareas del Plan 3, uno ya cerrado antes), **doce diferidos** con
> su razón escrita, y **ninguno omitido**. Cada fila dice **quién** lo cerró y **cómo
> se verificó** — y la columna «tarea» se contrastó contra el árbol, no contra el informe de
> la tarea: un informe que dice «cerrado» no es evidencia. La tabla con la auditoría
> completa, con las tres columnas, está en el **Plan 3**
> (`docs/superpowers/plans/2026-10-21-business-scope-transfer-and-retirement.md`,
> «La auditoría de herencia») y el detalle del addendum §B del **ADR-0013**.

**Lo que ya estaba en la lista del brief**

1. **`getBusinessesByOwnerId` y el `drop table public.business_ownership` con sus 19
   policies.** El único consumidor que todavía leía la tabla vieja estaba en el móvil:
   `apps/mobile/src/features/business/data/repository.ts:352`
   (`getBusinessesByOwnerId`, llamado desde `apps/mobile/src/features/business/hooks.ts:27`).
   **CERRADO — Tasks 8 y 10 del Plan 3.** El móvil lee `business_members`
   (`user_id`, `role='owner'`, `status='active'`, `deleted_at is null`) y deduplica los
   ids; la tabla se cayó en `20261021005034_drop_business_ownership.sql`. **Verificado
   en la base viva el 2026-10-21:** `to_regclass('public.business_ownership')` → `NULL`,
   **0** policies que la nombran, **0** funciones que la nombran.
2. **El acantilado de performance**, con su eje por negocio: ~328 µs por fila en el camino
   de miembro. Medido y escrito en `supabase/migrations/README.md`.
   **DIFERIDO — el Plan 3 no optimiza ese costo.** El lever es el costo por fila del
   helper, y no urge antes de que un negocio se acerque a 1.000 pedidos. Lo que el Plan 3
   sí dejó anotado: el helper nuevo se llama **una vez por fila de policy**, no una vez
   por fila de la tabla.
3. **El `Seq Scan on orders`** dentro del subplan hasheado de la policy de `profiles`,
   que ignora `idx_orders_user`.
   **DIFERIDO — es un eje de tabla, medido y anotado.** El Plan 3 no cambia la forma de
   la policy de `profiles` más que por el predicado que ya usaba.
4. **El guard que compara `BUSINESS_PLAN_LIMITS` contra los triggers**
   (`apps/api/src/database/security/plan-limits.db.spec.ts`), que pasa a ser la **única**
   costura entre el número que ve el dueño y el que aplica el motor. Se vuelve más
   importante, no menos: el Plan 2 agrego una segunda fuente de plan —la feature
   `staff_access`— que también vive en el catálogo de TypeScript.
   **YA CERRADO ANTES DEL PLAN 3, Y SIGUE VERDE.** El Plan 3 **no toca el catálogo de
   planes**, así que el guard tiene que seguir verde; verificado en el cierre del Plan 3
   (2026-10-21), con la suite del API completa en verde sobre este punto.
5. **El QUINTO lector de `business_ownership`** —los otros cuatro son `aggregateSelect`,
   `insert`, `countRetained` y `announcements.ownerIdsForBusinesses`, y ninguno es una
   comprobación de permiso—:
   `apps/api/src/modules/notifications/notification.handlers.ts:36-39` hace un `INNER JOIN`
   contra la tabla como REGLA DE PRESENCIA. Un negocio sin fila de propiedad devolvía cero
   filas, el `if (!row) return;` se comía el handler entero y NO SE AVISA NI AL CONSUMIDOR
   NI AL NEGOCIO: sin error y sin log.
   **CERRADO — Task 9 del Plan 3, con el cambio deliberado del test que lo pinneaba.**
   La regla de presencia pasó de «el negocio tiene una fila de `business_ownership`» a
   «el negocio tiene un **dueño vivo**» (`role='owner'` ∧ `status='active'` ∧
   `deleted_at is null`), y el test que lo pineaba **cambió de nombre y de fixture**, y
   son **dos** tests: «un negocio SIN dueño vivo no notifica a nadie» y «un negocio con
   dueño vivo notifica, aunque no tenga la fila vieja».

**Lo que este plan agregó y todavía estaba abierto**

6. **La transferencia de propiedad NO EXISTE, y por eso un dueño no puede irse.**
   **CERRADO — Tasks 3 y 4 del Plan 3.** La operación de base es
   `public.transfer_business_ownership(business_id, member_id)`
   (`20261020163244_ownership_transfer.sql`; el cerrojo, en
   `20261020174431_ownership_transfer_concurrency.sql`), y la puerta es
   `POST /businesses/:businessId/ownership/transfer`
   (`apps/api/src/modules/staff/ownership.controller.ts`). El invariante «un negocio
   activo tiene un dueño vivo» es un `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`
   sobre `business_members`, y no un `BEFORE`: la degradación y la promoción tienen que
   ser **dos sentencias** —el índice parcial `business_members_one_owner_per_business`
   comprueba fila por fila, así que en una sola el orden no está garantizado y la
   promoción puede chocar con un `23505`—, y un `BEFORE` vería el estado intermedio y
   negaría una transferencia legítima.
7. **Un dueño legacy que sólo vive en `business_ownership` todavía borra su cuenta en
   silencio.**
   **CERRADO — Task 5 del Plan 3. EL BACKFILL NO SE HACE:** medido, hay **0** filas en
   ese estado (0 `business_ownership` sin membresía, 0 membresías sin `business_ownership`),
   así que no hay nada que rellenar y no se inventa un backfill. Lo que se cierra es el
   **camino**: la puerta del borrado (`countRetained`) cuenta **sólo dueños de negocios
   ACTIVOS** —el join con `businesses.is_active` es lo que convierte el número en la
   puerta—, y `anonymise` llama a `public.release_business_ownership` **antes** de
   archivar las membresías, porque la función exige que el actor sea el dueño **VIVO**.
   (La fila de `business_ownership` que `anonymise` borraba ya no existe: la tabla se
   cayó en la Task 10.)
8. **La combinación de «vencida» está duplicada en TypeScript.**
   **CERRADO — Task 7 del Plan 3.** La combinación —`ttl = 0` **o** (sello presente **y**
   la fecha no pasó)— vive **una** vez, en
   `public.business_member_session_inside_promise(ttl, last_authenticated_at)`, y
   `apps/api/src/database/business-membership.ts` la llama. **La aritmética por separado**
   ya era de la base; lo que se movió fue la **combinación**. Y hay un guard
   unitario (`apps/api/src/database/business-membership.spec.ts`) que afirma que el SQL
   que genera la API nombra la función **una** vez y **no** contiene `interval`, ni
   `business_member_session_expires_at`, ni `now()`, ni `session_ttl_hours = 0`.
   **Una mutación del instante del borde (`>= now()` → `> now()`) es INVISIBLE con el
   código viejo y VISIBLE con el nuevo**, y la única aserción de toda la suite que la
   atrapa es la comparación nueva contra un oráculo de TypeScript independiente.
9. **`R0001` ahora cubre DOS negativas distintas**: el tope de plan (los triggers) y la
   entitlement `staff_access` (la API, `staff.service.ts:1235-1244`).
   **DIFERIDO — el Plan 3 NO adopta `R0003`.** El panel no lo conoce y el Plan 3 no toca
   el panel. La transferencia y la liberación usan **`R0004`, un código nuevo**, así que
   `R0001` sigue significando exactamente las dos cosas que significa hoy, y el panel no
   tiene que aprender un código nuevo para una operación que es suya. **El costo sigue
   vivo:** la UI tiene que leer el `detail` —que es prosa— para distinguir «te pasaste de
   miembros» de «tu plan no trae la feature». Registrado como decisión abierta en el
   addendum §B.7 del ADR-0013.

**Lo que las revisiones marcaron «Minor» o «needs partner» y seguía abierto**

10. **La contención del `manager` sólo la aplica esta API, y para las operaciones que RLS
    concede no es una frontera.**
    **CERRADO — Tasks 1 y 2 del Plan 3.** El detalle que el Plan 2 escribió era
    «cuatro policies de escritura»; **el Plan 3 verificó que son TRECE las policies que
    usan `can_manage_location`**, y cambió **el helper, no las trece**: la rama del rol
    pasó de `when r.member_role in ('owner', 'manager') then true` a
    `when r.member_role = 'owner' then true`, así que el `manager` llega a la fila por
    la rama del alcance. Un `manager` acotado a la sucursal A **ya no puede**, por
    PostgREST, editar ni borrar los productos de la sucursal B ni renombrarla: la
    contención pasó a ser una frontera de **datos**, en lecturas y en escrituras. Y las
    dos policies del roster —que el Plan 2 señalaba como «el `manager` no ve los alias
    fuera de su alcance»— se reescribieron como «el roster que alcanzas», con el
    requisito de rol DENTRO.
11. **La rama de admin de plataforma de `GET /staff` no está acotada.**
    **DIFERIDO — y el Plan 3 le AGREGÓ una puerta de escritura, no le quitó ninguna de
    lectura.** El admin **supervisa**, no administra: leer el roster de cualquier negocio
    es deliberado y está pineado por un test. Lo que el Plan 3 añadió es la rama de
    admin del **alta** de accesos, que sólo se abre si el negocio **no tiene dueño
    vivo** —y esa segunda mitad la contesta la base
    (`public.business_live_owner_count`), no un predicado propio de la API.
12. **El aviso de «tu dirección cambió» sigue encolándose a la dirección actual sin
    comprobar la entregabilidad.**
    **DIFERIDO — y la razón es del Plan 2, no del Plan 3.** El §8 nombra los dos
    endpoints que rechazan el **identificador enviado**, no el actual; y el rebote cae en
    nuestro propio dominio, no en el del negocio. El Plan 3 no toca los endpoints de Auth.
13. **La propiedad «la cascada no destruye una membresía» vive sólo en el servicio.**
    **CERRADO — Task 5 del Plan 3.** `AuthAccountRepository.eraseAccount` **ganó su
    propia guarda**: si la cuenta tiene alguna membresía —viva o ya cerrada— la cierra y
    **no** borra el perfil, porque borrarlo se la llevaría por la cascada
    (`business_members.user_id` es `ON DELETE CASCADE` desde `profiles`) y con ella el
    alias, que el índice único no libera a propósito. La rama es defensa en profundidad:
    la puerta manda igual a `anonymise`.
14. **El borrado archiva la membresía pero no sus filas de alcance.**
    **CERRADO — Task 5 del Plan 3.** `anonymise` archiva también las
    `business_member_locations`, y `public.release_business_ownership` hace lo mismo
    dentro de la base. Las dos tablas coinciden ahora sobre qué significa `deleted_at`:
    una membresía archivada con su alcance vivo sigue diciendo «esta persona llegaba a
    esta sucursal» de alguien que ya no está.
15. **El servicio escribe `role: 'staff'` explícitamente.**
    **DIFERIDO — el default de la columna no es una frontera.** Hoy el API y el esquema
    coinciden (`const role = body.role ?? 'staff'`), y quitar el default sería un cambio
    sin una decisión detrás. El Plan 3 no lo tocó.
16. **El 404 «Negocio no encontrado» es inalcanzable.**
    **DIFERIDO — pero el Plan 3 midió la afirmación y la encontró IMPRECISA, así que
    queda con su forma verdadera.** `requireActor` —la puerta de las ocho rutas del
    equipo— **nunca** lanza un 404: lanza 403 («No perteneces a este negocio»), así que
    en esas ocho el 404 es inalcanzable. Los **dos** 404 que existen (`staff.service.ts`
    en el alta y en `requireOwnerlessBusiness`) están en la **rama de admin de la
    plataforma**, que **no** pasa por `requireActor`, y ahí **sí son alcanzables** y
    **sí están probados** («un negocio que no existe es un 404 y no una membresía en la
    nada»). El estado imposible es el del **fixture** de ese test —le da una membresía en
    un negocio que no existe—, y el fixture es de `create`, que el Plan 3 no tocó.
17. **La compensación del alta es best-effort.**
    **DIFERIDO — la compensación existe** (`compensateCreatedUser` llama a
    `deleteUser`); lo que falta es el **mensaje al dueño** («y la cuenta puede seguir
    existiendo»), y el mensaje es de la pantalla del panel, que el Plan 3 no construye.
18. **El alcance vacío del que llama no está documentado ni testeado.**
    **CERRADO — Task 1 del Plan 3.** La regla es explícita y está en la base, no en el
    servicio: **sin filas de alcance no se alcanza nada, ni siquiera un acceso sin
    alcance** —sólo el dueño lo alcanza—. Y el alcance vacío **no es «todo»**: un
    `manager` sin alcance no lee ningún producto, ningún pedido, ninguna sucursal, y
    tampoco inserta ni borra. Lo único que el alcance vacío alcanza es **la propia fila
    de membresía**, por la excepción que vive en
    `public.business_member_reaches_member` —y esa excepción concede su fila, **no un
    recurso**: `can_manage_location` no se entera de ella.
19. **Las nueve rutas no tienen bucket de throttler propio.**
    **DIFERIDO.** El tope global (100/min/IP) cubre las dos rutas nuevas del Plan 3
    (`ownership/transfer` y `ownership/restore`), y la presión sobre GoTrue viene de
    `createUser`, que el Plan 3 **no agrega a una ruta nueva**: la recuperación crea el
    acceso por la puerta que ya existe (`POST /businesses/:id/staff`, rama de admin).
    Verificado en el árbol: `apps/api/src/modules/staff/` no tiene ningún decorador de
    throttler.
20. **Un round-trip más por lectura de pedido.**
    **DIFERIDO — es un ítem de performance, con el mismo lever que el 2.**
    `roleOf` es una segunda consulta en `GET /orders/:id`.
21. **El test del token forjado afirma sólo el status.**
    **DIFERIDO — el test viejo no se toca**, porque cambiarlo no es una decisión del
    Plan 3. Los tests **nuevos** del Plan 3 (transfer, restore) **sí** afirman el
    cuerpo de la respuesta y el código: «un R0004 de la base sale como un 422 con el
    motivo, no como un 500» y «un cuerpo sin new_owner_member_id es 400 antes de tocar
    la base».
22. **El módulo no afirma el provider del `service_role`.**
    **DIFERIDO — y el Plan 3 no lo cambió.** `staff.module.spec.ts` sigue afirmando
    `StaffService` y `StaffRepository`, y **no** `STAFF_AUTH_ADMIN` (verificado en el
    árbol el 2026-10-21). Lo que el Plan 3 **sí** hizo fue **crecer** el módulo:
    registra el controlador de la propiedad, y ahora son **exactamente tres**
    controladores — hay un test que lo afirma.
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