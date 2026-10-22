-- Registra en el ledger el dominio del producto: `role.ec`.
--
-- QUÉ HAY EN LA BASE Y QUÉ NO ESTÁ EN EL LEDGER
--
-- Producción corre en `role.ec`, y sus valores de `app_config` lo dicen:
--
--   support.email          = soporte@role.ec
--   contact.hola_email     = hola@role.ec
--   contact.negocios_email = negocios@role.ec
--   legal.contact_email    = legal@role.ec
--   privacy.contact_email  = privacidad@role.ec
--   email.from             = notificaciones@role.ec
--   links.admin_url        = https://admin.role.ec
--   store.default / store.ios_url / store.play_url = https://app.role.ec
--
-- Pero NINGUNA fila de `supabase_migrations.schema_migrations` escribe la fila
-- de `app_config` de `support.email`, `contact.hola_email`,
-- `contact.negocios_email`, `legal.contact_email` ni de los tres `store.*`:
-- esos valores se cambiaron en el proyecto vivo por una vía que no dejó
-- rastro en el ledger. Medido el 2026-10-21 sobre el ledger: `soporte@role.ec`,
-- `hola@role.ec`, `legal@role.ec` y `https://app.role.ec` no aparecen en
-- NINGUNA fila (0, 0, 0, 0); `negocios@role.ec` aparece en cuatro, pero
-- ninguna de ellas escribe `app_config` — escriben el cuerpo de las plantillas
-- y el valor de reserva del trigger, no la fila.
--
-- Las otras tres sí tienen su fila: `privacy.contact_email` la escribe
-- `20260927053728`, `email.from` la escribe `20260830014803` y
-- `links.admin_url` la escribe `20260927141336`. El directorio de
-- migraciones, entonces, no describía la base que hay: es la deuda de
-- `docs/security-debt.md` §8, la misma clase de hueco que `20260906131000`
-- documenta para el drop de aridad-2 de `cancel_order`.
--
-- POR QUÉ UN ARCHIVO NUEVO Y NO UNA EDICIÓN
--
-- Los archivos que ya escriben estos valores están SELLADOS: su `md5sum`
-- coincide con `md5(statements[1])` del ledger, y esa coincidencia es la
-- prueba de lo que corrió. `20260821205638` (siembra `support.email` y
-- compañía en `role.app`), `20260927053728` (normaliza
-- `privacy.contact_email`) y `20260927141336` (confirma el dominio del panel)
-- no se tocan: editarlos destruiría la evidencia. La corrección va en un
-- archivo nuevo, que es lo que este es.
--
-- QUÉ ARREGLA
--
-- 1. EL REPLAY. `20260927053728` termina en un `do $verify$` que falla si
--    alguna clave no social dice `role.app`, y `20260927141336` cierra igual.
--    En un entorno nuevo —donde el seed dice `role.app`— las dos fallan y
--    hacen rollback, así que `supabase db push` contra un proyecto limpio se
--    rompe en `20260927053728`. Este archivo va después y deja el final del
--    replay en `role.ec`.
--
-- 2. EL LEDGER. A partir de esta fila, el directorio describe la base que hay
--    y un `supabase db push` a un entorno nuevo deja las claves de `app_config`
--    en el mismo dominio que producción.
--
-- EN PRODUCCIÓN ESTE ARCHIVO NO CAMBIA NADA
--
-- Los valores de arriba ya son `role.ec`, así que el `update` de la sección 1
-- no encuentra ninguna fila que tocar; la semilla de `links.admin_url` choca
-- con la fila existente y no la pisa; y el barrido de plantillas y componentes
-- no encuentra ningún enlace a `https://role.app`. Este archivo es el REGISTRO
-- de lo que producción ya tenía, escrito en el único sitio donde un registro
-- significa algo.
--
-- IDEMPOTENTE
--
-- Correrlo dos veces no cambia nada: cada `update` toca sólo filas cuyo valor
-- todavía es el viejo, la semilla usa `on conflict do nothing`, y el
-- `do $verify$` del final convierte la promesa en algo verificable en vez de
-- algo declarado.
--
-- POR QUÉ `social.%` QUEDA EXENTO
--
-- En producción `social.facebook_url`, `social.instagram_url`,
-- `social.tiktok_url` y `social.youtube_url` valen
-- `https://www.facebook.com/role.app`, `https://www.instagram.com/role.app`,
-- `https://www.tiktok.com/@role.app` y `https://www.youtube.com/@role.app`.
-- Ahí `role.app` no es un host: es el NOMBRE DE LA CUENTA de la marca en el
-- dominio de otro. Reescribirlo rompería el enlace de cada pie de página, en
-- producción, sin que nadie lo pidiera. Por eso la sección 1 excluye el
-- espacio de nombres `social.%` y por eso la aserción final lo excluye
-- también: es la misma razón por la que `20260927053728` y `20260927141336`
-- lo exceptúan.
--
-- Lo que sí se reescribe, en las claves no sociales, es el HOST. El mismo
-- `replace` sirve para los dos casos porque, fuera de `social.%`, el dominio
-- viejo aparece en `app_config` siempre como host: el dominio del correo
-- (`soporte@role.app` -> `soporte@role.ec`) o el host de la URL
-- (`https://admin.role.app` -> `https://admin.role.ec`).
--
-- `email.from` —el remitente del correo saliente— entra en esa misma regla y
-- no necesita un caso aparte: en producción vale `notificaciones@role.ec`, así
-- que no se toca, y sólo se movería si todavía dijera `role.app`.
--
-- LO QUE ESTE ARCHIVO NO TOCA
--
-- El pie de página que producción guarda en `email_components` ("Footer
-- principal (oscuro)") tiene un `mailto:hola@role.app`. El barrido de la
-- sección 3 es del ENLACE (`https://role.app`), igual que el de
-- `20260927053728`, y ese `mailto:` no es un enlace: es una dirección de
-- correo en un dominio que no recibe correo, y corregirla cambia contenido
-- que producción muestra. Queda anotado aquí y no resuelto aquí: este
-- archivo registra el dominio y repara el replay; esa dirección es una
-- decisión aparte.

begin;

-- 1. Las claves no sociales que todavía dicen `role.app`.
--
-- `key not like 'social.%'` es la EXENCIÓN del archivo, y no es un detalle:
-- los valores de `social.%` en producción contienen la cadena `role.app` como
-- nombre de cuenta. `jsonb_typeof(value) = 'string'` evita reescribir un
-- valor que no sea texto (un array o un objeto), donde `value #>> '{}'`
-- devolvería el JSON entero y `to_jsonb(...)` lo convertiría en una cadena.
--
-- La condición `value #>> '{}' like '%role.app%'` es la que hace la operación
-- idempotente y la que la deja en no-op sobre producción: si el valor ya es
-- `role.ec`, la fila no entra.

update public.app_config
   set value = to_jsonb(replace(value #>> '{}', 'role.app', 'role.ec')),
       updated_at = now()
 where key not like 'social.%'
   and jsonb_typeof(value) = 'string'
   and value #>> '{}' like '%role.app%';

-- 2. `links.admin_url`.
--
-- El panel vive en el subdominio `admin.` del dominio del producto, que es
-- `role.ec`: `20260927141336` ya lo confirmó y ya lo puso. Aquí sólo se siembra
-- la fila cuando NO existe, que es el caso del replay (allí las dos
-- migraciones anteriores hacen rollback y se llevan la fila consigo).
--
-- `on conflict do nothing` porque una fila existente es de otro dueño: si
-- dijera `role.app`, la sección 1 ya la movió; si dice otra cosa, es una
-- decisión del operador y este archivo no la pisa.

insert into public.app_config (key, value, value_type, category, label, description, is_public, active)
values ('links.admin_url', to_jsonb('https://admin.role.ec'::text), 'string', 'links',
        'Admin panel URL',
        'Base URL of the admin panel, used to build the deep link in business-review emails. Configure it here rather than editing a migration.',
        false, true)
on conflict (key) do nothing;

-- 3. Plantillas y componentes.
--
-- El literal es `https://role.app`, el ENLACE, y por eso no puede tocar una
-- dirección de correo ni el nombre de una cuenta social: sólo la URL. Es
-- idempotente, y en producción no encuentra nada.

update public.email_templates
   set body_html = replace(body_html, 'https://role.app', 'https://role.ec'),
       updated_at = now()
 where deleted_at is null
   and body_html like '%https://role.app%';

update public.email_components
   set html_content = replace(html_content, 'https://role.app', 'https://role.ec'),
       updated_at = now()
 where deleted_at is null
   and html_content like '%https://role.app%';

-- 4. Cerrar la puerta detrás.
--
-- Una sola exención, `social.%`, y por la razón de arriba. `links.admin_url`
-- NO está exento: el dominio del panel está confirmado en `role.ec` desde
-- `20260927141336`, y un archivo que lo exceptuara afirmaría una conjetura en
-- vez de un hecho.
--
-- `like`, no regex: este archivo se transporta como texto y un backslash
-- perdido en un regex es un cambio semántico silencioso. `like` no tiene nada
-- que escapar.

do $verify$
declare
  v_leftovers text;
begin
  select string_agg(key, ', ') into v_leftovers
    from public.app_config
   where key not like 'social.%'
     and value::text like '%role.app%';

  if v_leftovers is not null then
    raise exception 'non-social app_config still references role.app: %', v_leftovers;
  end if;

  if not exists (
    select 1 from public.app_config
     where key = 'links.admin_url'
       and value #>> '{}' = 'https://admin.role.ec'
  ) then
    raise exception 'links.admin_url is not https://admin.role.ec';
  end if;

  if exists (select 1 from public.email_templates
              where deleted_at is null and body_html like '%https://role.app%') then
    raise exception 'an email template still links to https://role.app';
  end if;

  if exists (select 1 from public.email_components
              where deleted_at is null and html_content like '%https://role.app%') then
    raise exception 'an email component still links to https://role.app';
  end if;
end $verify$;

commit;