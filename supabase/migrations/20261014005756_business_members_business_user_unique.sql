-- ─────────────────────────────────────────────────────────────────────────────
-- Una persona es UN miembro por negocio
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ FALTABA ─────────────────────────────────────────────────────────────
--
-- `business_members` no tenía NINGUNA unicidad sobre `(business_id, user_id)`.
-- No es una unique constraint, no es un índice único, y el `on conflict
-- (business_id, user_id) do nothing` que el plan daba por hecho abortaba con
-- `42P10` — there is no unique or exclusion constraint matching the ON CONFLICT
-- specification— antes de insertar una sola fila.
--
-- ─── POR QUÉ NO ES SLACK ─────────────────────────────────────────────────────
--
-- Porque una persona es UN miembro por negocio con UN rol. Su alcance sobre
-- varias sucursales son VARIAS filas en `business_member_locations`, no varias
-- membresías: un `manager` de dos sucursales es un miembro con dos filas de
-- alcance.
--
-- Sin la unicidad, el API puede dar de alta dos membresías de la misma persona en
-- el mismo negocio con roles distintos — `owner` y `staff` — y las dos filas son
-- igualmente legítimas para el catálogo. `public.business_member_role()` del §6.2
-- paso 4 tiene que devolver UN rol, y frente a dos filas elegiría por lo que
-- Postgres le devolviera primero. Eso no es un detalle de implementación: es el
-- permiso de una persona decidido al azar.
--
-- ─── POR QUÉ EL GUARDIÁN VA ANTES DEL `ALTER TABLE` ──────────────────────────
--
-- Porque una migración de este repo falla en voz alta en vez de reconciliar en
-- silencio. Si mañana alguien inserta dos membresías del mismo dueño —por la vía
-- que sea, con `service_role` y sin ninguna policy que lo frene— el `ADD
-- CONSTRAINT` solo diría `23505` sin decir QUIÉN. El guardián cuenta las parejas
-- repetidas y las nombra antes de que el `ALTER` toque la tabla.
--
-- Cuenta filas VIVAS y DADAS DE BAJA, porque la constraint no distingue: si el
-- par está duplicado con una fila dada de baja, el `ALTER` también abortaría.
--
-- Medido antes de aplicar, en producción, y es por eso que el guardián pasa:
--
--     select count(*) from (
--       select business_id, user_id from public.business_members
--        group by business_id, user_id having count(*) > 1) d;
--     -- 0   (16 filas, de 16 duenos distintos en 16 negocios)
--
do $$
declare
  duplicates bigint;
  offenders text;
begin
  select count(*) into duplicates
    from (
      select business_id, user_id
        from public.business_members
       group by business_id, user_id
      having count(*) > 1
    ) duplicated;

  if duplicates > 0 then
    select string_agg(business_id::text || ' / ' || user_id::text, ', ')
      into offenders
      from (
        select business_id, user_id
          from public.business_members
         group by business_id, user_id
        having count(*) > 1
         order by business_id, user_id
         limit 5
      ) duplicated;

    raise exception
      'business_members tiene % pareja(s) (business_id, user_id) repetida(s) y la unicidad no se reconcilia sola. Parejas: %',
      duplicates,
      offenders;
  end if;
end
$$;

-- ─── POR QUÉ ESTA MIGRACIÓN Y NO UNA EDICIÓN DE LA DE LA TASK 2 ──────────────
--
-- `20261014002328_business_members_and_plans.sql` ya corrió y está sellada con su
-- md5 contra el ledger. Corregir hacia adelante.
--
-- Y qué sigue sellado: el backfill `20261014005016_backfill_business_members.sql`
-- lleva `on conflict do nothing` a secas, y así se queda. Correcto hacia adelante
-- es la regla: con esta constraint, `on conflict (business_id, user_id) do nothing`
-- pasa a ser válido para toda ruta de escritura futura —la de creación de accesos
-- del API del §6.2— que es donde de verdad importa.
--
alter table public.business_members
  add constraint business_members_business_id_user_id_key
  unique (business_id, user_id);