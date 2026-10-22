-- Registra en el ledger el dominio del producto: `role.ec`.
--
-- QUÉ HAY EN LA BASE
--
-- Producción corre en `role.ec` desde hace meses, y casi todo lo dice:
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
-- Y no es sólo el `app_config`. El dominio viejo se había quedado en TRES
-- superficies más, y ninguna la corrigió una fila del ledger. Las tres están
-- descritas en su sección de este archivo, y las tres se corrigen aquí.
--
-- POR QUÉ UN ARCHIVO NUEVO Y NO UNA EDICIÓN
--
-- Los archivos que ya escriben estos valores están SELLADOS: su `md5sum`
-- coincide con `md5(statements[1])` del ledger, y esa coincidencia es la
-- prueba de lo que corrió. `20260821205638` (siembra `support.email` y
-- compañía en `role.app`), `20260927053728` (normaliza
-- `privacy.contact_email` y barre el enlace `https://role.app` de las
-- plantillas y de los componentes) y `20260927141336` (confirma el dominio
-- del panel) no se tocan: editarlos destruiría la evidencia. La corrección va
-- en un archivo nuevo, que es lo que este es.
--
-- QUÉ ARREGLA
--
-- 1. EL REPLAY. `20260927053728` termina en un `do $verify$` que falla si
--    alguna clave no social dice `role.app`, y `20260927141336` cierra igual.
--    En un entorno nuevo —donde el seed dice `role.app`— las dos fallan y
--    hacen rollback, así que `supabase db push` contra un proyecto limpio se
--    rompe en `20260927053728`. Este archivo va después y deja el final del
--    replay en `role.ec`, sin una sola referencia a `role.app` fuera de las
--    cuentas sociales.
--
-- 2. EL LEDGER. A partir de esta fila, el directorio describe la base que hay
--    y un `supabase db push` a un entorno nuevo deja las claves de `app_config`
--    y los enlaces del producto en el mismo dominio que producción.
--
-- QUÉ CAMBIA EN PRODUCCIÓN: TRES COSAS, Y SÓLO TRES
--
-- Un archivo que no cambia nada es un archivo que no se puede reproducir hacia
-- un estado correcto: el `supabase db push` de un entorno nuevo reproduciría
-- el dominio viejo, que es justo lo que este archivo viene a arreglar. Así que
-- este archivo SÍ cambia cosas en producción, y lo que cambia es exactamente
-- lo que queda con el dominio viejo, medido el 2026-10-21:
--
--   1. El pie de página "Footer principal (oscuro)" de `email_components`
--      lleva `<a href="mailto:hola@role.app">`: un `mailto:` a un dominio en
--      el que no se recibe correo. Lo mueve la sección 4.
--
--   2. Tres banners de `public.slides` llevan `redirect_url` a
--      `https://role.app/about` (×2) y `https://role.app/for-business`: son
--      páginas NUESTRAS, del dominio que se ha adquirido, y mientras digan
--      `role.app` llevan a una página que no existe. Hoy los tres están
--      `active = false`, así que nadie los está viendo: por eso esto no es una
--      urgencia y por eso es una bomba cargada. Lo mueve la sección 5.
--
--   3. `public.notify_business_pending()` conserva `'https://admin.role.app'`
--      como RESERVA de `links.admin_url`. En producción no se nota, porque la
--      clave está y vale `role.ec`; pero si la clave falta o se desactiva, el
--      correo de revisión de negocios vuelve a apuntar a un host que no
--      existe. Lo mueve la sección 6.
--
-- Y NADA MÁS cambia en producción: las claves de `app_config` ya están en
-- `role.ec` (sección 1, que no encuentra ninguna fila), el barrido del
-- enlace `https://role.app` de las plantillas y de los componentes ya lo
-- hizo el sellado `20260927053728` (sección 3, que no encuentra nada), y
-- las cuentas sociales se dejan como están (sección 1 y la aserción final).
--
-- IDEMPOTENTE
--
-- Correrlo dos veces no cambia nada: cada `update` toca sólo filas cuyo valor
-- todavía es el viejo, la semilla usa `on conflict do nothing`, el barrido
-- del `mailto:` enumera las direcciones que quedan (que después de la
-- primera pasada son ninguna), y la reescritura de la función hace nada si
-- el literal viejo ya no está en el cuerpo. El `do $verify$` del final
-- convierte la promesa en algo verificable en vez de algo declarado.
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
-- LA PUERTA TIENE LA MISMA FORMA QUE EL BARRIDO
--
-- La comprobación final no busca la cadena suelta `role.app`: busca las FORMAS
-- que los barridos de este archivo saben arreglar. `role.app` es también el
-- nombre de la cuenta de la marca en las plataformas de otros
-- (`facebook.com/role.app`), y una puerta que buscara la cadena suelta un día
-- se negaría a aplicar una migración por una cadena que no es un dominio
-- nuestro, y el motivo del fallo no se vería. El sellado `20260927053728` ya
-- lo hizo bien —su comprobación miraba `https://role.app`, que es un host—.
-- La sección 7 dice forma por forma.

begin;

-- 1. Las claves no sociales que todavía dicen `role.app`.
--
-- `key not like 'social.%'` es la EXENCIÓN del archivo, y no es un detalle:
-- los valores de `social.%` en producción contienen la cadena `role.app` como
-- NOMBRE DE CUENTA de la marca en el dominio de otro. `jsonb_typeof(value) =
-- 'string'` evita reescribir un valor que no sea texto (un array o un
-- objeto), donde `value #>> '{}'` devolvería el JSON entero y `to_jsonb(...)`
-- lo convertiría en una cadena.
--
-- La condición `value #>> '{}' like '%role.app%'` es la que hace la operación
-- idempotente: si el valor ya es `role.ec`, la fila no entra. En producción
-- no entra ninguna, y ese es el motivo por el que esta sección no cambia
-- nada allí: las claves ya están donde deben.

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

-- 3. Plantillas y componentes: el ENLACE.
--
-- El literal es `https://role.app`, y es el ENLACE: por eso no puede tocar una
-- dirección de correo ni el nombre de una cuenta social. Es idempotente, y en
-- producción no encuentra nada —el sellado `20260927053728` ya lo movió—.

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

-- 4. Plantillas y componentes: el `mailto:`.
--
-- El pie de página "Footer principal (oscuro)" lleva
-- `<a href="mailto:hola@role.app">Soporte</a>`, y `role.app` es un dominio en
-- el que no se recibe correo: ese enlace no llega a nadie. Es la misma fuga
-- que el enlace, con otra forma, y el barrido de la sección 3 no la alcanza
-- porque su literal es `https://role.app` y aquí el texto es `mailto:`.
--
-- Un `mailto:` con `role.app` es SIEMPRE nuestro dominio, así que la forma
-- es inequívoca: no hay ningún `mailto:` a `role.app` que sea de otro. Por
-- eso el barrido es de la FORMA `mailto:` y no de la cadena suelta: un
-- `@role.app` suelto en un cuerpo puede ser el nombre de una cuenta
-- (`twitter.com/@role.app`), y reescribirlo rompería el enlace.
--
-- Las direcciones se ENUMERAN y después se reescriben con un `replace`
-- literal, sin captura ni referencia: un regex con `\1` es exactamente lo que
-- `20260927141336` advierte (un backslash perdido en el transporte es un
-- cambio semántico silencioso), y el patrón de la enumeración no lleva
-- ninguno —el punto de `role.app` va como `role[.]app`, que es una clase de
-- caracteres y no un escape—.

do $mailto$
declare
  v_addr text;
  v_new  text;
begin
  for v_addr in
    select distinct unnest(m)
      from (
             select c.html_content as cuerpo
               from public.email_components c
              where c.deleted_at is null
             union all
             select t.body_html as cuerpo
               from public.email_templates t
              where t.deleted_at is null
           ) cuerpos,
           regexp_matches(cuerpos.cuerpo, 'mailto:[^@[:space:]"<>]+@role[.]app', 'g') m
  loop
    v_new := replace(v_addr, '@role.app', '@role.ec');

    update public.email_components
       set html_content = replace(html_content, v_addr, v_new),
           updated_at = now()
     where deleted_at is null
       and strpos(html_content, v_addr) > 0;

    update public.email_templates
       set body_html = replace(body_html, v_addr, v_new),
           updated_at = now()
     where deleted_at is null
       and strpos(body_html, v_addr) > 0;
  end loop;
end $mailto$;

-- 5. Los banners: `slides.redirect_url`.
--
-- Tres filas de `public.slides` apuntan a `https://role.app/about` (×2) y
-- `https://role.app/for-business`. Son páginas NUESTRAS —las del propio
-- producto—, del dominio que se ha adquirido, y mientras digan `role.app`
-- llevan a una página que no existe. Hoy las tres están `active = false`
-- (medido el 2026-10-21), así que nadie las está viendo: por eso esto no es
-- una urgencia, y por eso es una bomba cargada. Un banner que alguien
-- reactiva mañana manda al usuario a un dominio muerto.
--
-- La condición es el PREFIJO: `redirect_url like 'https://role.app%'`. Un
-- banner que apunte a la web de otro no se toca, y el reemplazo es del mismo
-- prefijo. Un `role.app` que estuviera en otra posición —en un query string,
-- en un camino— tampoco se toca.
--
-- El barrido cubre TODAS las filas, también las de `deleted_at is not null`:
-- un enlace es un enlace, y un banner que alguien revive tiene que llevar a
-- la página buena. En producción no hay filas borradas, así que hoy la
-- diferencia no se ve.

update public.slides
   set redirect_url = replace(redirect_url, 'https://role.app', 'https://role.ec'),
       updated_at = now()
 where redirect_url like 'https://role.app%';

-- 6. `notify_business_pending()`: el literal de reserva del panel.
--
-- El sellado `20260927053728` movió el literal del panel a la clave
-- `links.admin_url` y dejó el valor viejo como RESERVA, para que borrar la
-- configuración no fuera la razón de que un operador perdiera el enlace
-- profundo. La reserva quedó con el dominio viejo: `'https://admin.role.app'`.
-- En producción no se nota, porque la clave está y vale `role.ec`; pero si
-- la clave falta o se desactiva, el correo de revisión de negocios vuelve a
-- apuntar a un host que no existe.
--
-- El cuerpo se reescribe EN SU LUGAR, con la técnica del archivo sellado: se
-- lee `pg_get_functiondef`, se sustituye el literal y se ejecuta el
-- `CREATE OR REPLACE` que sale de ahí. `CREATE OR REPLACE` conserva el OID y
-- el ACL, así que los permisos de la función no cambian.
--
-- UNA sola sustitución sirve para las DOS formas del literal:
--
--   - producción, que tiene la forma de la RESERVA
--     ('https://admin.role.app');
--   - el replay, donde `20260927053728` hace rollback y el cuerpo conserva
--     la forma original, con el literal entero
--     ('https://admin.role.app/businesses/').
--
-- Es idempotente de una manera explícita: si el literal viejo NO está, el
-- cuerpo ya está corregido y no se hace nada, en vez de fallar —un archivo
-- que ya corrió tiene que poder correr otra vez—. Y cuando el literal SÍ
-- está, la sustitución se comprueba contra el catálogo: el `execute` no
-- puede ser un no-op silencioso.

do $rewrite$
declare
  v_def text;
  v_old constant text := 'https://admin.role.app';
  v_new constant text := 'https://admin.role.ec';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_business_pending';

  if v_def is null then
    raise exception 'notify_business_pending() not found';
  end if;

  if position(v_old in v_def) > 0 then
    v_def := replace(v_def, v_old, v_new);

    -- La sustitución tiene que verse en el texto que se va a ejecutar: si no
    -- se viera, el `execute` de abajo sería un no-op silencioso.
    if position(v_new in v_def) = 0 then
      raise exception 'the admin URL literal was not substituted in notify_business_pending';
    end if;

    execute v_def;

    -- Y el catálogo tiene que decirlo. Sin esta lectura, un `execute` que no
    -- hubiera sustituido nada dejaría el dominio viejo en el cuerpo y sólo
    -- lo vería la aserción final, que no dice QUÉ falló.
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'notify_business_pending';

    if position(v_old in v_def) > 0 then
      raise exception 'notify_business_pending still carries %', v_old;
    end if;
  end if;
end $rewrite$;

-- 7. Cerrar la puerta detrás.
--
-- LA PUERTA TIENE LA FORMA DEL BARRIDO, NO LA DE LA CADENA SUELTA.
--
-- `role.app` es, además de nuestro dominio viejo, el NOMBRE DE LA CUENTA de la
-- marca en las plataformas de otros: `facebook.com/role.app`,
-- `tiktok.com/@role.app`, `youtube.com/@role.app`. Una puerta que buscara la
-- cadena suelta `role.app` un día se negaría a aplicar esta migración por una
-- cadena que NO es un dominio nuestro, y el motivo del fallo no se vería.
-- El sellado `20260927053728` lo hizo bien: su comprobación miraba
-- `https://role.app` —un host— y no la cadena suelta, y por eso una cuenta
-- social dentro de una plantilla nunca lo habría parado.
--
-- Por eso cada comprobación de aquí mira la FORMA que el barrido de su
-- sección sabe arreglar, y no la cadena suelta:
--
--   - `app_config`: el VALOR DE TEXTO de una clave no social (sección 1). La
--     exención de `social.%` sigue en pie, con su razón.
--   - `links.admin_url`: el valor exacto, que es el que la sección 2 siembra
--     y el que `20260927141336` confirmó. NO está exento: el dominio del
--     panel está confirmado en `role.ec`, y un archivo que lo exceptuara
--     afirmaría una conjetura en vez de un hecho.
--   - plantillas y componentes: el HOST `https://role.app` y la DIRECCIÓN
--     `mailto:<local>@role.app` —las dos formas de las secciones 3 y 4—. El
--     patrón de la dirección es el MISMO que usa la sección 4, sin un solo
--     backslash: un `mailto:` con `role.app` es siempre nuestro dominio.
--   - `slides.redirect_url`: el PREFIJO `https://role.app` (sección 5). Un
--     banner que apunte a la web de otro no es cosa nuestra.
--   - `notify_business_pending()`: el LITERAL `https://admin.role.app` (sección
--     6), que es lo único que esa sección sustituye.
--
-- `like`, no regex: este archivo se transporta como texto y un backslash
-- perdido en un regex es un cambio semántico silencioso. `like` no tiene nada
-- que escapar. La excepción es el patrón del `mailto:`, que no lleva ningún
-- backslash y que se usa tal cual en el barrido y en la puerta.

do $verify$
declare
  v_leftovers text;
  v_mailto constant text := 'mailto:[^@[:space:]"<>]+@role[.]app';
begin
  select string_agg(key, ', ') into v_leftovers
    from public.app_config
   where key not like 'social.%'
     and jsonb_typeof(value) = 'string'
     and value #>> '{}' like '%role.app%';

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

  if exists (
    select 1 from public.email_templates t
     where t.deleted_at is null
       and (t.body_html like '%https://role.app%'
            or exists (select 1
                         from regexp_matches(t.body_html, v_mailto, 'g')))
  ) then
    raise exception 'an email template still references role.app';
  end if;

  if exists (
    select 1 from public.email_components c
     where c.deleted_at is null
       and (c.html_content like '%https://role.app%'
            or exists (select 1
                         from regexp_matches(c.html_content, v_mailto, 'g')))
  ) then
    raise exception 'an email component still references role.app';
  end if;

  if exists (select 1 from public.slides
              where redirect_url like 'https://role.app%') then
    raise exception 'a slide still redirects to role.app';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'notify_business_pending'
       and pg_get_functiondef(p.oid) like '%https://admin.role.app%'
  ) then
    raise exception 'notify_business_pending still references the old admin URL';
  end if;
end $verify$;

commit;