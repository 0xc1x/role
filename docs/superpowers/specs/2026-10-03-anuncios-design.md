# Diseño: anuncios y avisos importantes en la app

Fecha: 2026-10-03. Estado: diseño revisado con el usuario, pendiente de aprobación
para pasar a plan de implementación.

---

## 1. El problema

El operador necesita poder publicar un mensaje al consumidor —novedades de la app,
mantenimiento programado, un cambio que le afecta— y que ese mensaje aparezca al
abrir la app sin que el usuario tenga que ir a buscarlo.

Hoy no existe ese canal. Lo más cercano es `slides`, pero `slides` se muestra en un
carousel de la home: si el usuario no entra a la home, no lo ve, y no hay noción de
"ya lo leí". `tips` es un texto suelto sin título, severidad ni ventana de tiempo.

El requisito de que aparezca **al abrir la app** es lo que separa esta feature de las
existentes: necesita (a) elegibilidad por audiencia y momento, y (b) estado de lectura.

## 2. Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Severidad `info` / `required`** | El operador elige el tono al publicar. Cubre los dos casos reales sin un tercer nivel que nadie usa. |
| D2 | **Ventana `start_at` / `end_at`** | Un aviso no es eterno. Ambos opcionales: `end_at` nulo = sin vencimiento. |
| D3 | **Solo el operador publica** (admin) | No hay rol de negocio que publique. Evita la pregunta de "quién puede hablar por Rolé". |
| D4 | **Banner en landing además del modal** | Un aviso de mantenimiento tiene que existir fuera de la app. El banner no bloquea. |
| D5 | **Audiencia híbrida** | `all` / `consumers` / `businesses` / lista de `user_ids` y `business_ids` concretos. |
| D6 | **Lectura híbrida** | `info` se descarta en el dispositivo; `required` se registra en servidor. |
| D7 | **`required` se puede cerrar pero vuelve** | No bloquea la app, ni por error ni nunca. La presión la pone el aviso, no el bloqueo. |
| D8 | **Orden: `priority` DESC, luego `created_at` DESC** | Control total desde el panel sin un campo más. |
| D9 | **Los `info` se acumulan en un modal; los `required` van de a uno** | Tres novedades pendientes se leen en un modal, no en tres aperturas. Un obligatorio es una decisión individual. |
| D10 | **Si coexisten, el `required` va antes que el lote de `info`** | Es lo que no se puede pasar por alto. D8 ordena dentro de cada grupo, no entre ellos. |

### D6 en detalle, porque es la que más se discutió

`info` → `AsyncStorage`, guardando el ID del último descarto **por audiencia**. Cero
escrituras, cero RLS, cero filas.

`required` → tabla `announcement_acknowledgements`. Necesario por dos motivos concretos:
un usuario que entra desde el móvil y desde la web no debe ver dos veces el mismo aviso,
y soporte tiene que poder responder "¿ya le avisamos?" — eso es una lectura de servidor,
no un recuerdo local.

El costo se paga solo donde sirve: `info` no escribe nunca.

## 3. Por qué no reusar nada existente

| Candidato | Por qué no |
|---|---|
| `slides` | Vive en la home, sin noción de "visto", y su modelo es promo con CTA, no mensaje a leer. |
| `tips` | **Descartado, con una decisión explícita.** Ver abajo. |
| `app_config` | Es key/value de un valor. Anuncios son una colección con vida propia; meterlos ahí los vuelve ingobernables. |
| `app_store` | Es bandeja de **entrada** (`delivery_status`). El anuncio es de salida. |

### Por qué `tips` no se reusa

`tips` sí existe, son 3 filas activas y se muestran en la sección **Explorar** de mobile, vía
`ExploreTipSection` → `useRandomTip()` → `fetchRandomTip()` → RPC `get_random_tip`. Si no
hay ninguno, el banner se oculta en silencio.

El motivo del descarte **no** es que falten columnas. Es que la semántica de selección es
contradictoria:

- `get_random_tip` devuelve **uno aleatorio**. Un tip es contenido giratorio: querés
  variedad, uno distinto por carga, y que la ausencia no sea un evento.
- Un anuncio es un **mensaje dirigido**: tiene que llegar a alguien, en un momento, y hay
  que registrar que lo leyó.

Fusionarlos obligaría a `tips` a llevar `title`, `severity`, `priority`, `audience_kind`,
`user_ids`, `business_ids`, `start_at` y `end_at`, más la tabla de acknowledgement. Y
`ExploreTipSection` tendría que seguir eligiendo al azar entre el subconjunto que **no**
sean anuncios: dos caminos de lectura contradictorios sobre una misma tabla, y un
`WHERE kind = 'tip'` en el RPC que hoy no existe.

El criterio que separa las dos cosas: **los tips son para enganchar, los anuncios son para
informar.** Y `tips` está funcionando con UI en Explorar — tocarlo arriesga algo que anda
para ganar nada.

### El costo que esto sí agrega

El operador va a tener **dos lugares donde escribir contenido**: la sección `Tips` que ya
existe y la nueva `Anuncios`. Es el precio consciente de la decisión.

Se acepta por ahora. La alternativa —que un anuncio pueda publicarse también como consejo
en Explorar, escribiendo la fila en `tips`— queda **anotada como posible** y no se
construye: es barato cuando haga falta, porque el anuncio ya tiene un cuerpo, pero es
scope creep si se anticipa sin que nadie lo pida.

## 4. Modelo de datos

Dos tablas. `severity` es `text` con `CHECK`, **no** enum — mismo criterio que
`app_store.state` (D4 del diseño de reportes): un enum obliga a migrar cada vez que
aparece un valor nuevo.

### `public.announcements`

| columna | tipo | notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `title` | `text` NOT NULL | |
| `body` | `text` NOT NULL | markdown plano; sin HTML |
| `severity` | `text` NOT NULL | `CHECK (severity IN ('info','required'))` |
| `audience_kind` | `text` NOT NULL | `CHECK (audience_kind IN ('all','consumers','businesses','specific'))` |
| `user_ids` | `uuid[]` NOT NULL DEFAULT '{}' | usado solo si `audience_kind='specific'` |
| `business_ids` | `uuid[]` NOT NULL DEFAULT '{}' | ídem |
| `priority` | `integer` NOT NULL DEFAULT 0 | |
| `active` | `boolean` NOT NULL DEFAULT true | |
| `start_at` | `timestamptz` | nulo = desde ya |
| `end_at` | `timestamptz` | nulo = sin vencimiento |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT now() | |

Índices:
- `(active, priority DESC, created_at DESC) WHERE active` — la consulta de la app
- `GIN (user_ids)`, `GIN (business_ids)` — el `&&` del targeting específico

### `public.announcement_acknowledgements`

| columna | tipo | notas |
|---|---|---|
| `announcement_id` | `uuid` NOT NULL | FK → `announcements.id` ON DELETE CASCADE |
| `user_id` | `uuid` NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `acknowledged_at` | `timestamptz` NOT NULL DEFAULT now() | |

PK compuesta `(announcement_id, user_id)`. Una fila por usuario y aviso: reintentar no
crece la tabla.

### RLS

`announcements` — **select** para `authenticated` y `anon` (el landing es anónimo), con la
elegibilidad completa en la política:

```sql
USING (
  active
  AND (start_at IS NULL OR now() >= start_at)
  AND (end_at   IS NULL OR now() <  end_at)
  AND (severity = 'info' OR auth.uid() IS NOT NULL)
  AND (
        audience_kind = 'all'
     OR (audience_kind = 'consumers' AND auth_helpers.my_role() = 'user')
     OR (audience_kind = 'businesses' AND auth_helpers.my_role() = 'business')
     OR user_ids @> ARRAY[auth.uid()]
  )
)
```

El fragmento `severity = 'info' OR auth.uid() IS NOT NULL` es lo que impide que un
`required` le llegue a un anónimo: sin él, el aviso que no se puede acknowledge
—porque no hay `auth.uid()` que poner— vuelve en cada apertura, para siempre.

`auth_helpers.my_role()` es `SECURITY DEFINER` y estable, y ya lo usan las políticas de
`profiles` y de `orders`. Es lo correcto acá y no un subquery a `profiles`: el helper
saltea RLS justamente para no depender de que el lector tenga permiso sobre `profiles`.

> **Verificado contra la base, 2026-10-03.** `auth_helpers.my_role()` devuelve
> `public.profiles.role` para `auth.uid()`, y hace `UNION ALL SELECT 'user'` cuando no
> hay fila de perfil. Dos consecuencias que el diseño asume a propósito:
>
> 1. Un visitante anónimo (`auth.uid()` nulo) resuelve a `'user'`, así que el landing ve
>    los avisos `all` **y** los `consumers`. Es lo correcto: el landing es la puerta de
>    entrada del consumidor. No ve los `businesses`, porque eso exige `'business'`.
> 2. `user_ids @> ARRAY[auth.uid()]` con `auth.uid()` nulo da `false` — la contención de
>    arrays no casa `NULL` — así que un anónimo nunca entra por la vía de `specific`.

Sin `INSERT`/`UPDATE`/`DELETE` para el cliente: los publishes solo por la API (D3).

`announcement_acknowledgements` — `SELECT` y `INSERT` propios; `user_id = auth.uid()`.
Sin `UPDATE` ni `DELETE`: no hay forma de "des-acknowledge".

`app_role` tiene tres valores: `user | business | admin`. `admin` no matchea `consumers`
ni `businesses` porque `my_role()` devuelve `'user'` por defecto solo cuando **no hay
fila de perfil**; un admin real tiene fila con `role='admin'` y solo ve los `all`. Si el
operador necesita alcanzar a los admins, se agrega un caso explícito — no se cuenta con
que caiga por defecto.

## 5. Superficie por aplicación

### mobile — modal

**Sin ruta propia.** El modal se monta en el layout de `app/` y se abre desde ahí, sin
`app/announcements.tsx`. Se descartó la ruta por dos razones: el gesto de atrás del
sistema cerraría una pantalla que no está en el stack —y el usuario esperaría que la
devolviera adonde fuera—, y el aviso puede ser una pila de varios `info`, que no es "una
pantalla" sino un modal con varias páginas.

Archivos nuevos:

- `apps/mobile/src/features/announcements/data/repository.ts` — lectura Supabase directo
- `apps/mobile/src/features/announcements/domain/announcement.ts` — el agrupado
- `apps/mobile/src/features/announcements/components/AnnouncementModal.tsx`
- `apps/mobile/src/features/announcements/hooks.ts` — TanStack Query + selección

Apertura: en el `_layout` de `app/`, junto a donde ya se resuelve la sesión. Se consulta
**una vez por arranque**, no en cada cambio de pantalla.

`title` y `body` son **ambos obligatorios**, también para un aviso de una línea. El título
es lo que el lector de pantalla anuncia al abrir el modal y lo que el operador usa para
distinguir uno de otro en la tabla del panel; dejarlo opcional produce la mitad de las
filas con el mismo título genérico.

### mobile — banner

Mismo `AnnouncementModal` en modo `banner` para el caso informativo en superficies
secundarias. Un solo componente, dos presentaciones.

### admin/api

Módulo NestJS `announcements` siguiendo `modules/tips` y `modules/slides`:
`controller` / `service` / `module` / `mappers`. Endpoints CRUD para el operador.

El de lectura pública **no recibe parámetros de audiencia y no filtra nada**: pide
filas y devuelve las que le llegan. La audiencia la decide `auth.uid()` dentro de la
policy, que es donde vive toda la elegibilidad de este feature; un `?audience=` en el
endpoint sería una segunda copia de esa regla, y de las dos copias solo se corrige la
que nadie mira. Para que la lectura ocurra *como* quien pregunta, el endpoint la
delega a Supabase con su token en vez de leer por la conexión de la API —que es
`service_role` y tiene `BYPASSRLS`, y vería los avisos dirigidos a otra persona.

**El acknowledgement no pasa por la API.** El cliente escribe
`announcement_acknowledgements` directo a Supabase y la policy lo ata con
`with check (user_id = auth.uid())`, así que "solo podés acknowledgear por vos" es
una restricción de la base y no una línea de código. Una vía por la API habría tenido
que sostenerlo el service, que escribe con `BYPASSRLS`.

Sección admin `features/announcements/` con el mismo esqueleto que `features/tips/`
(`api/ components/ forms/ queries/ tables/`), incluida la lista de sidebar.

El selector de audiencia específica **no necesita backend nuevo**: `features/directory`
ya llama a `/profiles?search=` y `/businesses?search=`.

### landing — banner

Server-render. Lee lo mismo vía el endpoint público de la API y pinta un banner
**dentro del flujo, sin overlay**. No requiere sesión, así que solo le alcanzan los
`audience_kind = 'all'` — por eso el aviso de mantenimiento tiene que ser `all`.

## 6. Selección y orden

Una sola consulta, en la política RLS para el filtro y en el cliente para el orden:

```sql
SELECT * FROM announcements
WHERE active
  AND (start_at IS NULL OR now() >= start_at)
  AND (end_at   IS NULL OR now() <  end_at)
ORDER BY priority DESC, created_at DESC
```

El cliente descarta los `required` ya registrados y los `info` ya descartados localmente, y
agrupa lo que queda. Como el filtro de audiencia ya viene aplicado por RLS, el cliente no
decide a quién le toca — solo qué mostrar primero.

### D9: los `info` se acumulan, los `required` no

Regla acordada: un modal puede mostrar **varios `info` juntos en la misma pantalla**, pero
los `required` van de a uno.

- **Lote de `info`** — los informativos pendientes se muestran juntos en un modal con
  páginas, se descartan todos con un solo gesto, y cada uno queda registrado en el
  dispositivo. Un usuario con tres novedades pendientes las lee en un modal, no en tres
  aperturas.
- **`required` de a uno** — cada obligatorio tiene su propio modal, y cerrarlo sin
  acknowledge lo deja pendiente para la próxima apertura. No se acumulan entre sí.

El `AnnouncementModal` recibe una **lista**, no un objeto. Lo que decide si un aviso es
"una página dentro del lote" o "un modal propio" es su severidad.

Consecuencia para el `conMax` del dominio: cuenta **modales abiertos**, no avisos. Un lote
de 5 `info` es un modal; un `required` es un modal por cada aviso pendiente.

### D10: los `required` van antes que el lote de `info`

Cuando coexisten los dos grupos en una misma apertura, **el obligatorio va primero**.

Con 1 `required` y 2 `info` pendientes, la secuencia es:

```
modal(required)   ← de a uno, en orden de priority/fecha
modal( info ×2 )  ← un solo modal, con los dos listados
```

Con 3 `required` y 2 `info`, son cuatro modales: tres obligatorios de a uno y después el
lote. No se intercalan — el agrupado es por severidad, no una consequence de D8.

Por qué el obligatorio primero: es lo que no se puede pasar por alto, y dejarlo para
después porque había novedades es justo el comportamiento que la severidad existe para
prevenir. El orden D8 (`priority`, luego fecha) ordena **dentro** de cada grupo, no entre
ellos.

El costo asumido: tres `required` pendientes son tres modales obligatorios, y el operador
puede crear esa situación sin darse cuenta. No se mitiga en el diseño sino en el panel —
el form de creación advierte cuando se publica un `required` y ya hay otro `required`
activo.

## 7. Manejo de errores — la parte que más importa

**La apertura de la app no puede depender de esta consulta.** Si el aviso falla, la app
abre igual. Es una consecuencia directa de D7.

- La query es `useQuery` con `retry: false` y sin `throwOnError`. Un fallo deja la
  pantalla vacía y sigue.
- El fetch va **después** de resolver la sesión, nunca bloquea el render.
- Un `required` sin acknowledge se remembers en servidor, así que un corte de red a
  mitad de la lectura no pierde el estado.

## 8. Testing

| Capa | Qué cubre |
|---|---|
| `announcements.rls.db.spec.ts` | La política de select: ventana, audiencia, que `anon` no lee los `specific`, y que `admin` solo lee los `all`. |
| `announcements` domain test | El agrupado: `info` en un lote, `required` de a uno, `required` antes que el lote (D10), y el orden `priority`/`created_at` **dentro** de cada grupo. |
| `AnnouncementModal.test.tsx` | `info` se cierra y no vuelve; `required` se cierra y vuelve; el lote de `info` se descarta con un solo gesto. |
| `repository.test.ts` | El descarte local se guarda por audiencia, y el acknowledgement escribe una fila y no crece al reintentar. |
| e2e mobile (Playwright) | El aviso aparece al abrir; el obligatorio sobrevive al cierre y reaparece en la siguiente apertura; con los dos grupos, el primero es el `required`. |

## 9. Fuera de alcance

- Push notification — hay `push-notifications` en admin, pero mezclarlo acá duplicaría el canal.
- Edición multi-idioma del cuerpo — el catálogo es es-ES.
- Métricas de apertura más allá del acknowledgement.
- Emails a la lista de usuarios.

## 10. Verificado contra la base

- `auth_helpers.my_role()` existe, es `SECURITY DEFINER` y estable, y ya lo usan las
  políticas de `profiles` y `orders`. Es el mecanismo correcto para la política de
  lectura, y no un subquery a `profiles`.
- `app_role` = `user | business | admin`.
- `features/directory` en admin ya expone `/profiles?search=` y `/businesses?search=`, así
  que el selector de audiencia específica no necesita backend.
- AsyncStorage ya está en uso en mobile (`src/core/supabase/storage-adapter.ts`), que es
  donde vive el descarte local de los avisos `info`.

Queda **una sola cosa sin verificar**, y es de implementación, no de diseño: que el índice
parcial `(active, priority DESC, created_at DESC) WHERE active` cubra de verdad la consulta
de la app. Se comprueba cuando exista la tabla, con `EXPLAIN ANALYZE`.