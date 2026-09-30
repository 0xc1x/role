-- Remove "Otra" from app_config['contact.cities'].
--
-- "Otra" is not a launch city. The landing contact form adds it itself: it
-- filters OTHER_CITY out of the configured list and appends it, so the user can
-- type a city Rolé has not opened (see
-- apps/landing/src/components/contact.tsx). Carrying it in the config as well
-- meant two sources of truth for the same option, and a stale entry here would
-- reappear in any consumer that reads the list without that filter.
--
-- "Santo Domingo" stays and stays first: it is the primary launch geography.
--
-- This migration is written but NOT applied. The Supabase server assigns the
-- version; after applying, rename the file to
-- <version>_fix_contact_cities_other_manual.sql and confirm
-- md5sum <file> == md5(statements[1]) in supabase_migrations.

begin;

do $$
declare
  current_value jsonb;
  cleaned jsonb;
begin
  select value into current_value
    from public.app_config
   where key = 'contact.cities';

  if current_value is null then
    raise exception 'app_config[contact.cities] no existe: crea la fila antes de aplicar esta migración';
  end if;

  if jsonb_typeof(current_value) <> 'array' then
    raise exception 'app_config[contact.cities] es %, se esperaba un array jsonb',
      jsonb_typeof(current_value);
  end if;

  if exists (
    select 1 from jsonb_array_elements(current_value) e
     where jsonb_typeof(e) <> 'string'
  ) then
    raise exception 'app_config[contact.cities] contiene elementos que no son strings: %', current_value;
  end if;

  -- Idempotente: si "Otra" ya no está, no se toca nada (updated_at intacto).
  -- La comparación va sobre el texto, no sobre el jsonb: '"otra"'::jsonb
  -- no iguala a '"Otra"'::jsonb porque la comparación de jsonb distingue
  -- mayúsculas, y un UPDATE que no coincide fila no falla: simplemente deja
  -- el valor como estaba. La aserción final es la que lo detecta.
  if exists (
    select 1
      from jsonb_array_elements(current_value) e
     where lower(e #>> '{}') = 'otra'
  ) then
    cleaned := (
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
        from jsonb_array_elements(current_value) with ordinality as t(e, ord)
       where lower(e #>> '{}') <> 'otra'
    );

    update public.app_config
       set value = cleaned, updated_at = now()
     where key = 'contact.cities';
  end if;

  if exists (
    select 1
      from public.app_config c, jsonb_array_elements(c.value) e
     where c.key = 'contact.cities' and lower(e #>> '{}') = 'otra'
  ) then
    raise exception 'no se pudo quitar "Otra" de app_config[contact.cities]';
  end if;
end $$;

commit;
