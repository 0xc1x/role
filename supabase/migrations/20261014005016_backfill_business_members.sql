-- ─────────────────────────────────────────────────────────────────────────────
-- Los dueños dejan de ser una fila aparte y pasan a ser miembros owner
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ HACE, Y POR QUÉ NO BORRA NADA ───────────────────────────────────────
--
-- Por cada fila de `business_ownership` mete UNA fila en `business_members` con
-- `role = 'owner'`. Ninguna fila nace con `deleted_at`: nada de lo que hay acá
-- está dado de baja, y el borrado lógico llega con la API.
--
-- `business_ownership` NO se toca acá. Se retira en el paso 7 del §6.2 del spec,
-- y hasta entonces las policies viejas y las nuevas tienen que decir lo mismo
-- sobre quién es dueño de qué. Este paso es el que hace seguro ese `drop`: en
-- producción hay 16 negocios y 16 filas de `business_ownership`, y después de
-- esto hay 16 negocios y 16 filas de `business_members`.
--
-- ─── EL LABEL DEL DUEÑO ES EL NOMBRE DEL NEGOCIO ────────────────────────────
--
-- En la UI esa fila representa al dueño del negocio, no a una persona con nombre
-- propio: un dueño no tiene un `label` como lo tiene un empleado.
--
-- ─── POR QUÉ `left join` A `profiles`, Y POR QUÉ EL `coalesce` ───────────────
--
-- `business_ownership.owner_id` es `NOT NULL` y referencia `profiles(id)`, así
-- que en cualquier base sembrada el `left join` nunca deja una fila sin perfil y
-- el `coalesce` nunca dispara. Los dos están igual porque el replay del harness
-- arranca SIN filas de perfil —los seeds no reproducen, y
-- `supabase/migrations/README.md` documenta por qué— y una violación de
-- `NOT NULL` no salta una fila: aborta la migración entera. Un `join` a secas
-- convertiría un dato incompleto en una migración que no se aplicó.
--
-- ─── POR QUÉ EL MISMO DUEÑO SALE VARIAS VECES ────────────────────────────────
--
-- Porque un dueño puede dirigir más de un negocio —en producción,
-- `admin@fudi.app` dirige 6 de los 16— y el acceso es por negocio, no por
-- persona. Por eso `business_members_alias_key` es único sobre
-- `(business_id, lower(alias))`: las 16 filas de este `insert` son 16 accesos, y
-- las del mismo dueño comparten alias a propósito. Con el índice global que
-- había antes de `20261014004804_business_members_alias_key_per_business`, esto
-- abortaba con `23505`.
--
-- ─── POR QUÉ ES RE-EJECUTABLE, Y POR QUÉ SIN OBJETIVO DE CONFLICTO ──────────
--
-- `on conflict do nothing`. El archivo se replayea en cada `db push` contra
-- entornos que ya lo corrieron, y una migración de datos que no se puede repetir
-- convierte cada replay en un error de unicidad.
--
-- SIN objetivo a propósito, y no por descuido: `on conflict (business_id,
-- user_id)` exige que exista una unique constraint o un índice único sobre esa
-- pareja exacta, y `business_members` no tiene ninguno —el `id` es la PK, y los
-- otros dos índices únicos son `(business_id, lower(alias))`—, así que esa forma
-- aborta con `42P10` antes de insertar una sola fila. Medido en producción:
--
--     select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
--      where c.relname = 'business_members' and i.indisunique
--        and pg_get_indexdef(i.indexrelid) like '%(business_id, user_id)%';
--     -- 0
--
-- Y no se pierde precisión por no nombrarlo. `business_ownership` tiene
-- `business_id` como PRIMARY KEY, así que dos filas de origen nunca compiten por
-- el negocio, y las únicas colisiones posibles —el alias, dentro del mismo
-- negocio— son la misma fila que ya estaba. En una primera corrida no se saltea
-- NADA; en una segunda se saltea exactamente la fila que ya existe. Por eso
-- además el conteo se afirma: un dueño que no llegue a `business_members` sale
-- como una fila de menos, no como un silencio.
--
insert into public.business_members (business_id, user_id, role, label, alias)
select o.business_id,
       o.owner_id,
       'owner',
       b.name,
       coalesce(p.email, o.owner_id::text || '@owner.invalid')
from public.business_ownership o
join public.businesses b on b.id = o.business_id
left join public.profiles p on p.id = o.owner_id
on conflict do nothing;