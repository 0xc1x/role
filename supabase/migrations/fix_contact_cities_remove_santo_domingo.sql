-- fix_contact_cities_remove_santo_domingo
--
-- `app_config['contact.cities']` incluía "Santo Domingo" (Rep. Dominicana) en
-- una plataforma ecuatoriana: el dominio es role.ec y `support.phone` es un
-- +593. El sitio publicaba además esa geografía en
-- `apps/landing/src/lib/faq.ts`.
--
-- Idempotente y ruidoso: solo reescribe el valor cuando es un array jsonb que
-- contiene "Santo Domingo". En cualquier otro estado inesperado ABORTA con
-- `raise exception` en vez de escribir a ciegas, para que un app_config
-- corrupto se delate en el ledger en vez de quedar pisado en silencio.
-- Sobre una base donde el valor ya es el correcto, el UPDATE no toca filas y
-- todas las aserciones pasan: no-op.
--
-- NO APLICADA. El archivo está escrito pero nadie lo ejecutó. El número de
-- versión lo asigna el servidor al aplicarla por `apply_migration`; después
-- hay que renombrar el archivo a
-- `<version>_fix_contact_cities_remove_santo_domingo.sql` y comprobar que
-- `md5sum` del archivo == `md5(statements[1])` del ledger. Ver
-- supabase/migrations/README.md.

begin;

update app_config
   set value      = '["Quito","Guayaquil","Cuenca","Manta","Otra"]'::jsonb,
       updated_at = now()
 where key = 'contact.cities'
   and jsonb_typeof(value) = 'array'
   and value ? 'Santo Domingo';

do $$
declare
  stored jsonb;
  expected constant jsonb := '["Quito","Guayaquil","Cuenca","Manta","Otra"]'::jsonb;
  non_strings text;
begin
  select value into stored from app_config where key = 'contact.cities';

  if stored is null then
    raise exception
      'app_config[contact.cities] no existe: crea la fila antes de aplicar esta migración';
  end if;

  if jsonb_typeof(stored) <> 'array' then
    raise exception
      'app_config[contact.cities] es %, se esperaba un array jsonb',
      jsonb_typeof(stored);
  end if;

  select string_agg(elem #>> '{}', ', ' order by elem #>> '{}')
    into non_strings
    from jsonb_array_elements(stored) as elem
   where jsonb_typeof(elem) <> 'string';

  if non_strings is not null then
    raise exception
      'app_config[contact.cities] contiene elementos que no son strings: %',
      non_strings;
  end if;

  if stored ? 'Santo Domingo' then
    raise exception
      'app_config[contact.cities] todavía contiene "Santo Domingo"';
  end if;

  if stored <> expected then
    raise exception
      'app_config[contact.cities] es % y se esperaba %; revisa la lista a mano antes de migrar',
      stored, expected;
  end if;
end
$$;

commit;
