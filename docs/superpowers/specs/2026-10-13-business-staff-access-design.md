# Accesos de staff por sucursal + base de monetización por plan

- Fecha: 2026-10-13
- Estado: propuesto, pendiente de revisión
- Ámbito: `supabase/migrations`, `packages/commons`, `apps/api`, `apps/mobile`, `apps/admin`

## 1. Problema

Un negocio con varias sucursales tiene hoy **una sola persona con acceso**: el dueño.
`public.business_ownership` tiene `business_id` como PRIMARY KEY, así que el vínculo
negocio-persona es 1:1 por diseño, y no hay forma de registrar a un empleado sin romper el
modelo.

`public.profiles.role` es un enum global (`user` | `business` | `admin`) que no tiene
dimensión de negocio: no sabe distinguir a un cajero de un dueño dentro de la misma
empresa, y no sabe qué sucursal toca a cada uno.

Consecuencias hoy:

- Un empleado que need manage pedidos y productos **no puede entrar**: si se le pone
  `role = 'business'` ve el panel, pero las ~20 policies de RLS resuelven el acceso con
  `exists (select 1 from business_ownership ...)` y no devuelven nada.
- El panel del dueño vive en `apps/mobile/app/(business)/` y escribe **directo a Supabase**
  (ADR-0002): RLS es la única frontera de permiso.
- `public.orders` **no tiene columna de sucursal** (solo `business_id`), así que no hay
  forma de acotar pedidos a una sucursal.
- No existe ningún sistema de planes, suscripciones ni feature flags en el repo.

## 2. Restricciones del producto

- Mercado ecuatoriano: los negocios medianos **no tienen correo corporativo con dominio
  propio**, y los pequeños **no tienen tablet por sucursal**.
- Los empleados sí tienen teléfono y usan la app desde el dispositivo propio.
- Requisito explícito: **sin switch de modo consumidor/negocio** en la app.
- Es la base de la monetización: el acceso de staff entra gratis para el negocio pequeño y
  los límites por plan son la palanca de venta.

## 3. Decisiones

### 3.1 Identidad del empleado: alias de correo + PIN gestionado por el negocio

El dueño crea el acceso; el sistema crea un `auth.users` real con `email_confirm: true`
(cero correos enviados) y un perfil con `role = 'business'`.

```
centro@panaderia-familia.staff.role.app
└────┬───┘ └──────┬──────┘ └────┬───┘ └─────┬────┘
 código   slug del negocio  dominio de Rolé   código del dueño, legible
```

- **El dominio del alias es de Rolé, nunca del negocio.** Un alias sobre el dominio real
  del negocio rebota en cualquier flujo de correo de GoTrue y daña la reputación de
  envío de un dominio que el negocio puede usar después para email legítimo.
- El slug ya es `UNIQUE` en `businesses`, así que el alias es único globalmente.
- El identificador es un email válido: entra por el **login que ya existe**, sin una
  segunda puerta ni un switch. `validateEmailField` solo exige `includes("@")` y el login
  valida la contraseña con `minLength 1` (`apps/mobile/src/features/auth/domain/validation.ts:6-34`),
  así que un PIN de 6 dígitos pasa sin tocar validación.
- `public.handle_new_user()` lee `role` desde `raw_user_meta_data` y solo admite
  `user` | `business`, así que el alta con `user_metadata: { role: 'business' }` produce el
  perfil correcto sin modificar el trigger.

Descartadas: OTP por teléfono (cuesta un mensaje por alta, requiere proveedor cableado; el
proyecto tiene 0 usuarios con teléfono) e invitación por código de reclamo (obliga a
reescribir el gate de navegación en 6 archivos sin ganar nada).

### 3.2 Dos ejes de rol, no uno

`profiles.role` sigue siendo el rol **de plataforma** (¿qué tipo de cuenta es?).
`business_members.role` es el rol **dentro de un negocio**.

| | `profiles.role` | `business_members.role` |
|---|---|---|
| Pregunta | ¿Qué tipo de cuenta es esta persona? | ¿Qué puede hacer en **este** negocio? |
| Valores | `user` · `business` · `admin` | `owner` · `manager` · `staff` |
| Dimensión | Global, una por persona | Por vínculo |

Regla de equivalencia: **toda fila en `business_members` implica
`profiles.role = 'business'`**. Los tres roles son "de negocio" para el mundo exterior.

El dueño deja de ser una estructura aparte: pasa a ser un `business_members` con
`role = 'owner'`, con el mismo código que sus empleados. Dueño y staff son un solo modelo.

### 3.3 Alcance por sucursal

`public.offers` **ya tiene** `business_location_id` (NOT NULL, con FK compuesta a
`business_locations (id, business_id)`), así que los productos ya están acotados por
sucursal. Lo que falta es `orders`.

### 3.4 Identidad == permiso, dos cosas distintas

El alias resuelve **quién es** el empleado. No resuelve **qué puede hacer**. `business_members`
sigue siendo necesaria y sigue siendo el 80% del trabajo, idéntico con alias o con código.

## 4. Modelo de datos

### 4.1 `business_members`

```sql
create table public.business_members (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  role                 public.business_member_role not null default 'staff',
  label                text not null,
  alias                text not null,          -- lo que se teclea; espejo de auth.users.email
  status               public.business_member_status not null default 'active',
  session_ttl_hours    integer not null default 24 check (session_ttl_hours >= 0),
  last_authenticated_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_business on public.business_members (business_id);
create unique index business_members_alias_key on public.business_members (lower(alias));
```

- `session_ttl_hours = 0` significa sesión sin expiración (modo "equipo propio").
- `status`: `active` | `disabled`. `disabled` es el estado de revocación.
- `alias` se espeja desde `auth.users.email` para poder listar accesos sin privilege de
  lectura sobre `auth`.

### 4.2 `business_member_locations`

```sql
create table public.business_member_locations (
  member_id   uuid not null references public.business_members (id) on delete cascade,
  location_id uuid not null references public.business_locations (id) on delete cascade,
  primary key (member_id, location_id)
);
```

Tabla aparte en vez de una columna `location_id` en el miembro porque un `manager` de dos
sucursales es **un** miembro con **dos** filas de alcance, no dos miembros.

### 4.3 `business_plans_state`

```sql
create table public.business_plans_state (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_code   public.business_plan_code not null default 'free',
  updated_at  timestamptz not null default now()
);
```

### 4.4 Enums

```sql
create type public.business_member_role   as enum ('owner', 'manager', 'staff');
create type public.business_member_status as enum ('active', 'disabled');
create type public.business_plan_code     as enum ('free', 'pro', 'pro_plus');
create type public.business_feature       as enum ('staff_access', 'payments', 'visibility_plus');
```

`profiles.app_role` **no se toca**.

### 4.5 Catálogo de planes

Vive en `packages/commons` como código tipado, no como tabla. Agregar un feature es una
línea y un typecheck; agregar un tier es una entrada más. Cuando existan precios,
suscripciones reales o tiers por tamaño, se mueve a tablas — con el negocio ya diciendo
qué necesita.

```ts
// packages/commons/src/business/enums/business-plan.ts
export const BUSINESS_PLAN_LIMITS = {
  free:     { locations: 1,   members: null },
  pro:      { locations: 5,   members: 20  },
  pro_plus: { locations: null, members: null },
} satisfies Record<BusinessPlanCode, { locations: number | null; members: number | null }>;

export const BUSINESS_PLAN_FEATURES = {
  free:     ['staff_access'],
  pro:      ['staff_access', 'payments'],
  pro_plus: ['staff_access', 'payments', 'visibility_plus'],
} satisfies Record<BusinessPlanCode, readonly BusinessFeature[]>;
```

Interpretación de los límites: **ambos topes son acumulativos**. Un plan `pro` admite
hasta 5 sucursales **y** hasta 20 miembros; exceder cualquiera de los dos bloquea el
crecimiento.

## 5. Permisos

### 5.1 Una sola función de permiso

```sql
-- public.can_manage_location(business_id uuid, location_id uuid) returns boolean
-- SECURITY DEFINER, SET search_path = ''
--   owner  -> todo el negocio
--   manager-> todo el negocio, excepto borrar sucursales y administrar al owner
--   staff  -> solo las locations de su fila de alcance
```

Se apoya en dos helpers más pequeños, todos `STABLE SECURITY DEFINER` con
`search_path` pineado (patrón ya establecido por `public.business_is_approved`):

- `public.business_member_role(p_business_id uuid) → text` — rol activo del `auth.uid()`.
- `public.business_has_feature(p_business_id uuid, p_feature text) → boolean` — feature del plan.

### 5.2 Validez de sesión, en el mismo lugar

`session_ttl_hours` y `last_authenticated_at` se evalúan **dentro de
`can_manage_location`**, no en un guard aparte. Así RLS y API aplican exactamente la misma
regla.

- `session_ttl_hours = 0` → la comprobación se salta.
- `last_authenticated_at` lo sella un endpoint que el panel llama una vez, después del login
  (`POST /staff/session`). Un solo round-trip extra.
- Si el TTL venció, RLS deniega y el panel necesita distinguir "venció" de "no autorizado":
  se expone `public.business_member_session_state() → jsonb` con
  `{ role, location_ids, expires_at, reason }` para que la app pueda explicar la salida en
  vez de mostrar un error genérico.

**Distinción honesta:** el TTL es un control de responsabilidad y UX, no una frontera de
seguridad. La frontera es la revocación. Un empleado con sesión abierta y TTL vencido pierde
acceso porque RLS lo deniega; pero quien quiera reutilizar una sesión compartida ya tiene
el credencial de la persona, y por eso el modo "equipo" es una decisión explícita del
dueño, no un valor por defecto.

### 5.3 Límites de plan: trigger, no guard

El panel escribe directo a Supabase, así que un límite comprobado en la API se puede
saltar con un insert desde el dispositivo. Los límites van en triggers
`BEFORE INSERT OR UPDATE`:

- `business_locations` → si `count(*) + 1 > locations(plan)` se aborta.
- `business_members` → si `count(*) + 1 > members(plan)` se aborta.
- Ambos consultan `business_has_feature(business, 'staff_access')` antes de insertar.

**Los triggers solo disparan en escritura. Nunca bloquean lectura ni operación.** Si a un
negocio le baja el plan, los accesos que ya creó **siguen funcionando**; lo que se bloquea
es crecer. Meterle un lock a una panadería un viernes a las 5 porque no renovó sería la
forma más rápida de perder al cliente que más te necesita.

### 5.4 Graceful: nadie se queda fuera de su negocio

Un negocio hoy puede tener 3 sucursales y le toca `free` (límite 1). No se le degrada ni se
le penaliza: sigue operando, no puede crear una cuarta, y la app le muestra el camino al
plan que le corresponde. Los límites son **de crecimiento hacia adelante**, nunca una
sentencia retroactiva.

`owner` es intocable: ningún rol puede desactivar al dueño. La transferencia de propiedad
queda fuera de la v1 y se anota como pendiente, no como olvidado.

## 6. Cambios en RLS

### 6.1 `orders` gana columna de sucursal

```sql
alter table public.orders
  add column business_location_id uuid,
  add constraint orders_location_business_fkey
    foreign key (business_location_id, business_id)
    references public.business_locations (id, business_id) on delete restrict;
-- backfill
update public.orders o set business_location_id = f.business_location_id
  from public.offers f where f.id = o.offer_id;
alter table public.orders alter column business_location_id set not null;
```

`reserve_offer` escribe la columna. A partir de ahí, `orders` se acota igual que `offers`.

### 6.2 Sustitución de `business_ownership`

Hoy unas 20 policies resuelven el acceso con
`exists (select 1 from public.business_ownership o where o.business_id = <x> and o.owner_id = auth.uid())`,
en: `businesses` (select/update), `business_locations` (all), `offers` (select/insert/update/delete),
`orders` (select), `order_events` (select), `business_hours`, `coupons`, `payouts`,
`business_notification_preferences`, `offer_categories`, `payment_intents`, `profiles`
(para ver a sus clientes), más 3 RPCs (`cancel_order`, `set_order_status`,
`validate_pickup_code`) y el trigger `bootstrap_business_companions`.

Todas pasan a `public.can_manage_location(...)` o `public.business_member_role(...)`.

**Orden de migración** (el orden importa: las policies viejas siguen válidas mientras
`business_ownership` exista):

1. Crear `business_members`, `business_member_locations`, `business_plans_state`, enums.
2. Backfill: `insert into business_members (business_id, user_id, role, label, alias)
   select o.business_id, o.owner_id, 'owner', b.name, p.email
   from business_ownership o join businesses b using (business_id)
        join profiles p on p.id = o.owner_id;`
3. Backfill de alcance: el owner no necesita filas (su rol da acceso total).
4. Crear los helpers SQL.
5. Crear las policies nuevas **junto** a las viejas (mismo predicado, evaluadas por
   separado) y verificar que ambas dan el mismo resultado.
6. Dropear policies viejas y RPCs viejos; recrear los RPCs con el helper.
7. `drop table public.business_ownership` (y sus grants).
8. Triggers de límites de plan.
9. Grants a `authenticated` de solo lectura sobre `business_members` /
   `business_member_locations`.

### 6.3 Grants

`business_members` y `business_member_locations` **no se escriben desde el cliente**: el
alta de accesos requiere `service_role` (`admin.createUser`), que está fuera del alcance
de una sesión normal. El cliente solo lee (y solo lo que su propia fila de alcance permite).
- El trigger de límite sobre `business_members` es defensa en profundidad (nadie escribe
  desde el cliente). El que de verdad importa es el de `business_locations`, porque el
  panel **sí** inserta sucursales directo a Supabase.

## 7. Contratos (`packages/commons`)

```
business/enums/business-member-role.ts       BUSINESS_MEMBER_ROLES
business/enums/business-member-status.ts     BUSINESS_MEMBER_STATUSES
business/enums/business-plan.ts              BUSINESS_PLAN_CODES + BUSINESS_FEATURES
                                             + BUSINESS_PLAN_FEATURES + BUSINESS_PLAN_LIMITS
business/schemas/business-member.schema.ts   zod: label, role, status, session_ttl_hours,
                                             business_location_ids[], alias
business/dtos/business-member.dto.ts         tipos inferidos
auth/schemas/auth.schema.ts                  + StaffSessionStateSchema
```

La API exporta los contratos; mobile los consume por `workspace:*` como cualquier otro
dominio. El enum `app_role` no se modifica.

## 8. API (`apps/api`)

Módulo nuevo `staff`, con el patrón de resource que ya usan los demás módulos. Rutas bajo
`@Controller('businesses/:businessId/staff')`, todas con el guard de rol de negocio
**reemplazado** por `can_manage_location`:

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /businesses/:id/staff` | owner, manager (acotado) | Lista los accesos del negocio |
| `POST /businesses/:id/staff` | owner, manager (acotado) | Crea el `auth.users` + la membresía; devuelve la tarjeta de entrega con el PIN **una sola vez** |
| `PATCH /businesses/:id/staff/:memberId` | owner, manager (acotado) | Rol, sucursales, `session_ttl_hours` |
| `POST /businesses/:id/staff/:memberId/rotate` | owner, manager (acotado) | Genera PIN nuevo y devuelve la tarjeta |
| `POST /businesses/:id/staff/:memberId/disable` | owner, manager (acotado) | `status='disabled'` + `ban_duration` |
| `POST /businesses/:id/staff/:memberId/enable` | owner, manager (acotado) | Quita el ban |
| `DELETE /businesses/:id/staff/:memberId` | owner | Borra membresía + usuario de Auth |
| `POST /staff/session` | cualquier miembro | Sella `last_authenticated_at` |

Reglas de la capa de servicio:

- **Alcance de un `manager` sobre los accesos**: puede crear, editar, rotar, pausar y
  eliminar **solo** accesos cuyo conjunto de sucursales esté contenido en el suyo, y nunca
  uno con `role = 'owner'`. Un `manager` no ve los accesos de sucursales que no gestiona,
  ni siquiera en la lista. `owner` no tiene esta restricción dentro de su negocio.
- El PIN **nunca se devuelve después de crearlo**. Se genera server-side (`crypto.randomInt`)
  y se entrega una vez; después solo se puede rotar.
- **Rotar y desactivar son operaciones distintas y la UI lo dice.** Rotar exige el PIN
  nuevo en el siguiente login pero **no cierra las sesiones abiertas**; desactivar invoca
  `ban_duration` y mata todas las sesiones, incluidas las persistentes de tablet. Un dueño
  que rota creyendo que cortó acceso es el peor resultado posible de esta pantalla.
- Desactivar se implementa con `admin.updateUserById(id, { ban_duration: '876000h' })` y
  reactivar con `ban_duration: 'none'`. **Desactivar, no borrar**: el historial de quién
  operó en el negocio vale cuando alguien se va.
- El alta es una transacción con compensación: si la inserción de la membresía falla, se
  borra el `auth.users` creado — mismo patrón que el onboarding de negocios
  (`businesses.service.ts:114-157`).
- `change-email` y `forgot-password` **rechazan** identificadores del dominio de staff: el
  correo se iría a una bandeja inexistente y rebotaría. Se comprueba en ambos sentidos (UI
  y endpoint).
- Se **consolida** la copia triplicada del predicado de propietario
  (`BusinessesRepository.isOwner`, `OffersRepository.isBusinessOwner`,
  `OrdersRepository.isBusinessOwner`) en un solo `StaffAccessService` / helper. El smell ya
  está señalado en `businesses.service.ts:731-735`.

### 8.1 Excepción consciente a ADR-0002

El móvil **no** habla hoy con la API: `EXPO_PUBLIC_API_URL` existe en el esquema de env
pero está vacío y sin uso, y `functions.invoke` da cero resultados. El alta de accesos
necesita `service_role`, que no se puede obtener desde RLS. Por eso este feature introduce
un cliente HTTP en el panel, **limitado a la pantalla de equipo**:

> El móvil no consume la API para **operar** (sigue yendo directo a Supabase con RLS como
> frontera), pero sí la consulta para **administrar quién opera**.

Se documenta como ADR. La alternativa —una Edge Function— se descarta porque partiría las
reglas de negocio en dos runtimes y la API no las conocería.

## 9. Mobile (`apps/mobile`)

### 9.1 Login — cuatro cambios, ninguno nuevo

`app/(auth)/login.tsx`:

1. **Cuentas usadas en este dispositivo**: chips con los identificadores con los que ya se
   entró (almacenados localmente). **El PIN nunca se guarda.** Resuelve la memoria del
   alias largo a partir del segundo ingreso.
2. **"¿Olvidaste tu contraseña?" condicional**: si el identificador termina en
   `*.staff.role.app`, el diálogo dice que las cuentas de negocio no usan correo y pide al
   dueño que rote el PIN, y **no envía nada**.
3. **Escanear la tarjeta** que llena el identificador y enfoca el PIN. Reutiliza
   `PickupScannerSheet` / `features/business/components/orders/qr.ts`, que ya existen: no
   se agrega cámara ni librería.
4. **Opcional**: quitar `autoComplete="email"` / `textContentType="emailAddress"`
   (líneas 94-97) para que el sistema no ofrezca el correo personal del empleado encima de
   lo que escribe. Gana el caso staff, estorba un poco al consumidor.

**No se tocan** los labels del formulario ni se agrega una segunda puerta: el dueño
comunica el alias y el PIN, y el empleado los teclea en el login de siempre. No hay switch
de modo.

### 9.2 Panel — sección Equipo

En la pestaña `Negocio` (`app/(business)/management.tsx`) aparece la sección **Equipo y
accesos**, que sigue el patrón `features/` del repo:

- **Lista**: nombre, alias, rol, sucursales, política de sesión, última entrada, estado.
- **Alta**: nombre, rol, sucursales (casillas), política de sesión. El sistema propone el
  código corto y el alias; el PIN lo genera el sistema con opción de regenerar.
- **Tarjeta de entrega**: alias + PIN + QR, con el aviso de que el PIN no se puede
  recuperar, solo rotar, y botones de copiar / compartir.
- **Acciones**: rotar PIN (con confirmación que dice que las sesiones abiertas siguen
  vivas), cambiar sucursales, cambiar rol, pausar, reactivar, eliminar.
- **Corte de emergencia**: "cortar todos los accesos" arriba del todo, con confirmación
  explícita.

Alta por turnos (24 h) vs. equipo propio (sin expiración) es una decisión del dueño por
acceso. El modo persistente solo se ofrece a `owner` y `manager`: un `staff` no debería
poder dejar un tablet abierto para siempre.

### 9.3 Cambios de datos en el panel

- `getBusinessesByOwnerId` (`features/business/data/repository.ts:352-376`) deja de leer
  `business_ownership` y pasa a leer `business_members` con `role = 'owner'`.
- `announcements.repository` y `notification.handlers` en la API dejan de hacer join a
  `business_ownership`.
- Los queries de productos y pedidos ya filtran por `business_location_id`; los de
  pedidos empiezan a usar `orders.business_location_id`.

## 10. Admin (`apps/admin`)

El dueño administra; el admin supervisa. Dos pestañas nuevas en el drawer de detalle del
negocio (`features/businesses/components/business-detail-drawer.tsx`):

**Equipo** — solo lectura. Nombre, alias, rol, sucursales, estado, última entrada, y un
"cortar todos los accesos" de emergencia. El admin no crea accesos: los crea el dueño.

**Plan** — plan actual y cambio manual. Hasta que exista la pasarela de pagos, el plan se
asigna a mano desde acá. Esa pestaña es el asiento de la monetización: cuando llegue el
gateway pasa a ser "Suscripción" sin cambiar de ubicación.

## 11. Verificación

```sh
bun run typecheck
bun run test
bun run build
```

Además, siguiendo el patrón existente (`businesses.rls.db.spec.ts`):

- **DB**: matriz `(rol, sucursal) → puede leer / escribir` sobre `offers`, `orders`,
  `business_locations`, `business_members`; límites de plan por trigger; `disabled` corta
  acceso de inmediato; grandfathering (negocio con 3 sucursales en `free` sigue operando).
- **API**: alta con compensación, PIN de un solo uso, rotación no cierra sesión,
  desactivación sí, rechazo de `forgot-password` / `change-email` en alias, sello de sesión
  y TTL vencido.
- **Mobile**: chips de cuentas previas, guarda condicional de contraseña, validación del
  login con alias, estado de sesión vencida.
- **Admin**: render de las dos pestañas y del corte de emergencia.

Migraciones solo por `apply_migration`, con la verificación de `md5sum` contra
`supabase_migrations.schema_migrations` que exige `supabase/migrations/README.md`.

## 12. Fuera de alcance

- Transferencia de propiedad del negocio.
- Confirmación por teléfono del empleado (el campo `phone` queda listo).
- Alias sobre el dominio real del negocio.
- Facturación, suscripciones recurrentes, descuentos y tiers por tamaño.
- `visibility_plus` como efecto real (el enum existe; el comportamiento, no).
- Auditoría histórica de acciones por miembro más allá de atribuir la sesión.

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reescribir ~20 policies + 3 RPCs + `business_ownership` en un solo cambio | Orden de migración en 6.2: lo nuevo se crea y se verifica antes de que caiga lo viejo |
| Un `staff` ve datos de otra sucursal | Helper único; tests de matriz `(rol, sucursal)` sobre las 4 tablas |
| Rate limit de GoTrue con tablet compartido por IP | PIN de 6+ caracteres; el API tiene throttler propio en las rutas de gestión |
| Rebote de correo en flujos de Auth | Alias bajo dominio de Rolé + bloqueo explícito de `forgot-password` / `change-email` |
| Coste de MAU de Supabase por accesos de staff | Es la unidad de cobro del tier; hay que confirmar el plan del proyecto antes del primer lanzamiento real |
| Que el dueño crea que rotar PIN corta acceso | La UI lo dice en la confirmación y `disable` es una acción separada y obvia |