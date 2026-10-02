# Reportes de errores sobre `app_store` — Diseño

> Estado: aprobado en conversación, pendiente de revisión escrita.
> Fecha: 2026-09-30
> Dominio afectado: `packages/commons`, `apps/api`, `apps/admin`, `apps/mobile`, `supabase/migrations`

## 1. Objetivo

Permitir que un usuario reporte un error **desde la app móvil**, en las secciones
consumer y business, con capturas adjuntas, y que el equipo lo vea y lo triaje
desde una sección del panel de administración.

No es un tracker de incidencias con historial ni una herramienta de soporte. Es
un buzón: el usuario cuenta qué se rompió, el equipo lo clasifica y lo cierra.

## 2. El hallazgo que condiciona el diseño

`app_store` **no** es el formulario de la App Store de Apple. Es un store
genérico clave-valor, multi-escritor, discriminado por `namespace`, creado en
`20260830014750_create_app_store.sql`. `POST /contact` es solo uno de sus
escritores. La analogía de nombre es lo que hace pensar que el reporte de
errores debe ir por otro lado: no es el caso, `app_store` fue diseñada para
exactamente esto.

## 3. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Reutilizar `app_store` con `namespace = 'bug_report'` | La tabla es genérica y multi-escritora por diseño. Cero tablas nuevas. |
| D2 | **No** agregar una columna `type` | `namespace` ya cumple ese papel. Una segunda columna discriminante puede discrepar de la primera y nada en el schema lo impide. El repo ya resolvió esto: `contact-inbox.constants.ts` bloquea el namespace en el servidor precisamente para que un cliente no alcance filas de otro tipo. |
| D3 | Renombrar `status` → `delivery_status` | `status` era un nombre genérico para un eje concreto. El panel ya lo llamaba por lo que es (`lib/labels.ts:87` → `PROCESADO: "Notificado"`); el rename pone el código en paz con la etiqueta. |
| D4 | Agregar `state text` (no enum) | Un enum obliga a migrar cada vez que aparece un namespace nuevo, que es el acoplamiento que se quiere evitar. El vocabulario se declara fuera de la tabla. |
| D5 | Agregar `origin entry_origin` | Canal de origen. No es derivable de `namespace` y sí se necesita. |
| D6 | **Móvil → Supabase directo**, no vía API | El AGENTS de la raíz establece que la API es BFF de admin/landing y que el móvil consume Supabase directo con RLS como frontera. |
| D7 | Bucket de imágenes **privado** | Los buckets existentes (`images`, `product_images`, `buisness_images`, `business_images`, `categories_images`) son de lectura pública. Una captura de bug puede contener pedidos, direcciones y teléfonos: no puede quedar accesible con solo la URL. |
| D8 | Sin notificación (correo/webhook) por ahora | YAGNI. Deuda consciente: un reporte puede quedar en silencio en el panel. |
| D9 | El vocabulario vive en `packages/commons` | Precedente: `CONTACT_MESSAGE_STATUSES`. Dato que cambia con negocio → `app_config`; contrato que consume código → `commons`. |

### D3 y D4: dos ejes ortogonales, no dos variantes

Entrega y triaje son ejes independientes:

| | `delivery_status` | `state` | `origin` |
|---|---|---|---|
| Mensaje de contacto | `PENDIENTE → PROCESADO` | `NULL` siempre | `web` |
| Reporte de error | `PENDIENTE → PROCESADO` | ciclo de vida | `ios`/`android`/`pwa` |

Contacto usa solo el primero. Un bug report usa ambos, y eso no es redundancia:
responden a dos preguntas distintas ("¿llegó el aviso al equipo?" / "¿el bug
está resuelto?").

## 4. La migración

Una sola migración, vía **`apply_migration`** — nunca `execute_sql` ni el
dashboard. Después: renombrar el archivo a la versión que asignó el servidor y
verificar `md5sum` del archivo == `md5(statements[1])` del ledger.

```sql
-- ── eje de entrega, renombrado ──────────────────────────────
alter table public.app_store rename column status to delivery_status;
alter index public.app_store_status_idx
  rename to app_store_delivery_status_idx;
alter type public.store_entry_status rename to delivery_status;

-- ── dos columnas genéricas ───────────────────────────────────
create type public.entry_origin as enum ('ios','android','pwa','web');

alter table public.app_store
  add column state  text,
  add column origin public.entry_origin;

create index app_store_state_idx on public.app_store(state);

-- ── cerrar el privilege que faltaba ────────────────────────
revoke select on public.app_store from anon, authenticated;

-- ── bucket privado de capturas ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('bug_report_images', 'bug_report_images', false);

update storage.buckets
   set file_size_limit     = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where name = 'bug_report_images';

create policy "Reporters attach their own screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bug_report_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Reporters read their own screenshots"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bug_report_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── el ÚNICO camino de escritura desde el cliente ───────────
create policy "Users submit bug reports"
  on public.app_store for insert to authenticated
  with check (
    namespace       = 'bug_report'
    and delivery_status = 'PENDIENTE'
    and state       = 'ABIERTO'
    and origin in ('ios','android','pwa')
    and deleted_at is null
  );

-- ── la autoría la sella el servidor ─────────────────────────
create or replace function public.stamp_bug_reporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.value := coalesce(new.value, '{}'::jsonb)
               || jsonb_build_object('reporter_id', auth.uid()::text);
  return new;
end;
$$;

create trigger on_bug_report_stamped
  before insert on public.app_store
  for each row when (new.namespace = 'bug_report')
  execute function public.stamp_bug_reporter();
```

### Por qué esta policy es el corazón de D6

El `WITH CHECK` es lo que hace defendible que el cliente escriba directo:

- `namespace = 'bug_report'` → no puede inyectar filas en la bandeja de
  contactos, ni en el namespace que se invente mañana.
- `delivery_status = 'PENDIENTE'` → no puede fingir que el aviso ya se entregó.
- `state = 'ABIERTO'` → no puede auto-asignarse `CORREGIDO`.
- Solo hay policy de `INSERT`. `UPDATE` y `DELETE` quedan sin policy, luego
  siguen denegados por RLS: el cliente puede reportar, nunca auto-atenderse.

### La mina que esta migración pisa

`20260928184943_enable_rls_on_unrecorded_tables.sql` revocó de `app_store`
**solo** `truncate, trigger, references`. `SELECT`, `INSERT`, `UPDATE` y
`DELETE` siguen en manos de `anon` y `authenticated`; lo único que frena hoy
son las cero policies.

> *"One GRANT, or one permissive policy added to app_store for convenience,
> makes it readable."*

Por eso el `revoke select` va **en esta migración**: sin él, cualquier policy
de `SELECT` que alguien escriba después abre la tabla entera, y con ella la
bandeja de contactos, a cualquiera con la anon key. El privilegio debe
coincidir con el deny-all.

## 5. Vocabulario (`packages/commons`)

Nuevo dominio `packages/commons/src/bug-report/`, hermano de `contact/`.

```ts
export const BUG_TRIAGE_STATES = [
  "ABIERTO", "EN_REPRODUCCION", "CORREGIDO", "DUPLICADO", "DESCARTADO",
] as const;
export type BugTriageState = (typeof BUG_TRIAGE_STATES)[number];

// `web` se admite aunque hoy solo entre iOS/Android/PWA, para que la landing
// quepa después sin otra migración.
export const ENTRY_ORIGINS = ["ios", "android", "pwa", "web"] as const;
```

Schemas zod: listado paginado (filtro por `state`), detalle, y el patch de
triaje que valida `state` contra `BUG_TRIAGE_STATES`.

## 6. Contrato renombrado (breaking)

`packages/commons/src/contact/schemas/contact-inbox.schema.ts`:

- `ContactMessageListItemSchema.status` → `delivery_status` (línea 61)
- `ListContactMessagesQuerySchema.status` → `delivery_status` (línea 90)
- `ContactMessageStatus` → `ContactDeliveryStatus`

Consumidores a actualizar **en el mismo PR**: mapper de la API, filtro y badge
del panel, `lib/labels.ts`, `StatusBadge`, columnas de la tabla, y los 6
specs que leen la propiedad. Regenerar `openapi.json` (CI lo gatea).

## 7. API — lectura y triaje

`apps/api/src/modules/bug-report-inbox/`, hermano de `contact-inbox`:

- `BUG_REPORT_NAMESPACE = 'bug_report'`, constante server-side, aplicada en las
  TRES operaciones (filtro del listado, verificación del detalle, verificación
  previa a la escritura), igual que hace `contact-inbox`.
- Mapper **lista blanca**, como `ContactInboxMapper`: nombra campo por campo lo
  que sale. `value` contiene `reporter_id` (PII) y rutas de las capturas: no
  se publican en el listado.
- El triaje escribe `state` y devuelve la fila. Valida `state` contra el
  vocabulario antes de escribir.

## 8. Admin — nueva sección

El usuario la pidió explícitamente. Sección hermana de la bandeja de contactos,
construida con el **mismo resource module** que ya usan las demás pantallas
(por el AGENTS de admin: reutilizar el patrón, cero abstracciones nuevas).

- Ruta registrada en el árbol de rutas generado (hay precedente: commit
  `a793ebd chore(admin): register the router type in the generated route tree`).
- Listado: resumen del mensaje, `origin`, `state`, fecha. **`reporter_id` NO
  aparece en el listado**: es PII y el listado es la superficie que se ve de un
  vistazo. Va solo en el detalle, si el operador lo necesita. La §7 (mappers
  lista blanca) manda sobre la tentación de mostrarlo: seguridad primero, como
  el orden de prioridad del AGENTS.
- Filtros: `state` y `origin`.
- Detalle: mensaje íntegro, **capturas**, y las acciones de triaje.
- Las capturas se piden al API, que devuelve **URLs firmadas de 5 minutos**
  sobre el bucket privado. El panel **nunca recibe una ruta utilizable**: sin
  el token, la URL no descarga nada.
- Ojo con lo que eso **no** promete: la ruta va en claro dentro del path de la
  URL firmada (`/object/sign/<bucket>/<ruta>`), así que el panel ve el nombre
  del bucket y el uid del reportante. Supabase no ofrece proxear los bytes por
  el API como alternativa, y el uid no le agrega nada al panel: el detalle ya
  expone `reporter_id` explícitamente. Lo que la firma protege es el **acceso
  sin token**, que es funcional, no una garantía de no-vocabulario-interno.

## 9. Móvil

`apps/mobile/src/features/bug-report/` (dominio / datos / presentación),
siguiendo la convención de capas del AGENTS de mobile.

- **Dos entry points, un solo sheet**: menú de perfil (consumer) y panel del
  negocio. Precedente del patrón de audiencia: `onboardingAudience(role)`.
- El cliente hace `storage.from('bug_report_images').upload(...)` a
  `<uid>/<uuid>.<ext>` y luego inserta la fila en `app_store` con las rutas en
  `value.images`.
- El insert no pide `reporter_id`: lo sella el trigger (D6).
- i18n por el catálogo `strings.ts`, sin literales inline.

### Orden de operaciones

Subir imágenes primero, insertar la fila después. Si el insert falla, sobran
imágenes huérfanas en el bucket — Coste bajo, y el inverso (fila sin imagen
apuntando a un path que nunca existió) produce un reporte roto que miente.

## 10. Errores

| Situación | Comportamiento |
|---|---|
| Imágenes > 5 MB o MIME no admitido | Falla en el upload, antes de crear la fila. Mensaje en español. |
| Insert rechazado por RLS | `toAppError` lo mapea a un mensaje honesto, no a un 500 crudo. |
| Bucket no configurado en un entorno | El reporte se crea **sin** imágenes; el flujo de texto nunca depende del almacenamiento. |
| `value` que no matchea el contrato | No lanza: sale con `readable: false` y todo en `null`, como `ContactInboxMapper`. |

## 11. Pruebas

- **Dominio** (`bun test`): validación del vocabulario de `state`, y que un
  estado desconocido se rechaza.
- **RLS** (spec `.db`, siguiendo `enable-rls.rls.db.spec.ts`): que `anon` no
  inserta; que `authenticated` no inserta en `namespace='contact'`; que no
  puede escribir `state='CORREGIDO'` ni `delivery_status='PROCESADO'`; que no
  puede `UPDATE` ni `DELETE`; que `reporter_id` queda sellado con `auth.uid()`
  y no con lo que mande el cliente; que `select` sigue denegado.
- **Storage**: que un usuario no lea las capturas de otro (carpeta = `uid`).
- **API**: mapper como lista blanca — quitar una clave del DTO no deja fuga.
- **Mobile**: el sheet valida antes de subir; el dismiss no navega.
- **Admin**: render de listado, detalle y acciones de triaje.

## 12. Fuera de alcance

Notificación por correo o webhook · lectura del estado por el usuario ·
historial de cambios de `state` · métricas de bugs · formulario en la landing ·
adjuntar video o audio.

## 13. Rollback

Dejar el código sin deploy y revertir la migración. La pérdida sería las filas
de `bug_report` de la ventana (ninguna en producción todavía) y las capturas del
bucket. `revoke select` y el rename **no** se revierten: dejarlos mantiene la
tabla cerrada, que es el estado defendible.
