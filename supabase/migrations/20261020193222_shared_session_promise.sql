-- ─────────────────────────────────────────────────────────────────────────────
-- La combinación de «vencida» sale de TypeScript y vive en SQL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── EL PROBLEMA, EN UNA FRASE ──────────────────────────────────────────────
--
-- La COMBINACIÓN de las dos mitades de «vencida» —TTL apagado **o** (sello
-- presente **y** la fecha compartida no pasó)— estaba escrita en TypeScript
-- (`apps/api/src/database/business-membership.ts`) y en SQL, y el guard que
-- decía «la cuenta de la expiración vive en un solo sitio» leía
-- `pg_proc.prosrc`: una migración que cambiara la definición de «vencida» en
-- SQL desincronizaba la API **en silencio**. No había error, no había
-- prueba, y la API seguía GRANTING con su propia cuenta mientras la base
-- contaba otra cosa.
--
-- La ARITMÉTICA —`last_authenticated_at + ttl horas`— ya vivía en un solo
-- sitio desde `20261015031154`: `business_member_session_expires_at`. Lo que
-- seguía duplicado era la COMBINACIÓN, que es la regla que decide: la
-- aritmética dice CUÁNDO vence una sesión, y la combinación dice si una
-- sesión está dentro de la promesa.
--
-- ─── LA REGLA, EN UNA FRASE ─────────────────────────────────────────────────
--
-- **Una sesión está dentro de la promesa si el TTL está apagado, o si tiene
-- sello y la fecha compartida todavía no pasó.**
--
-- Las dos mitades, ni una más:
--
--   - `session_ttl_hours = 0` es el modo «equipo propio» del §9.2: no hay
--     vencimiento, y por eso la fila no necesita sello.
--   - con el TTL puesto, hace falta un sello (`last_authenticated_at is not
--     null`) y hace falta que la fecha compartida no haya pasado.
--
-- ─── POR QUÉ UNA FUNCIÓN Y NO UNA EXPRESIÓN ──────────────────────────────────
--
-- Porque la expresión es lo que se duplica. `can_manage_location` la tenía
-- escrita como «con sello y vencida, o sin sello con el TTL puesto», y
-- `business_member_session_valid` como la negación de eso. Dos textos
-- distintos para la misma regla: el primero en positivo y el segundo en
-- negativo, y por eso el `>=` de uno era el `not (... < now())` del otro.
-- Cualquier cambio futuro tenía que acordarse en los dos.
--
-- Con una función, la regla tiene un nombre, y el nombre se puede buscar.
--
-- ─── POR QUÉ `STABLE` Y NO `IMMUTABLE` ───────────────────────────────────────
--
-- Porque compara contra `now()`, y `now()` es `STABLE`: dentro de una
-- transacción es una constante, y entre transacciones no lo es. La
-- ARITMÉTICA (`business_member_session_expires_at`) sigue siendo `IMMUTABLE`,
-- que es donde tiene que estar: no depende del reloj.
--
-- ─── POR QUÉ NO ES `SECURITY DEFINER` ───────────────────────────────────────
--
-- Porque no lee ninguna fila. Recibe el TTL y el sello DEL LLAMADOR y
-- contesta sobre lo que le pasaron, no sobre el estado de nadie. Por eso
-- `authenticated` puede ejecutarla sin que filtre nada: no hay dato de la base
-- en su respuesta.
--
-- ─── EL ACL ─────────────────────────────────────────────────────────────────
--
-- `{postgres, service_role, authenticated}`, igual que su hermana
-- `business_member_session_expires_at`. `service_role` es la API, que escribe
-- con ese rol y no tiene el JWT del usuario; `authenticated` es el motor de
-- las policies, que evalúa las expresiones con el rol de quien llama.
--
-- ─── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
--
-- `business_member_session_state` —la que EXPLICA— no se toca: sigue
-- calculando `expires_at` y sigue reportando los mismos `reason`
-- (`ok`, `session_expired`, `session_never_stamped`) con la misma forma de
-- `jsonb`. La diferencia es que ahora hay una prueba que dice que su
-- `reason: 'ok'` y esta función no se contradicen, que antes no existía.
--
-- Y ninguna policy cambia: las trece que leen `can_manage_location` siguen
-- leyendo lo mismo, y lo que cambia es lo que el helper contesta, que es
-- exactamente lo mismo que contestaba.
--
-- ─── LA VUELTA ATRÁS ────────────────────────────────────────────────────────
--
-- Un `drop function` y tres cuerpos restaurados. El texto está en los
-- archivos sellados `20261015031154_shared_ttl_expiry_accounting.sql` y
-- `20261015024825_business_policy_tightening.sql`, **copiado, no editado**.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `business_member_session_inside_promise`: LA COMBINACIÓN
--
-- `stable`, cuerpo calificado, `search_path = ''`, sin `security definer`.
--
-- El `null` que puede devolver sale SÓLO de un TTL nulo, y el CHECK de la
-- tabla (`session_ttl_hours >= 0`, `NOT NULL`) lo prohíbe. Se deja que la
-- función conteste EXACTAMENTE lo que contestaba la expresión de TypeScript
-- —que con un TTL nulo también devolvía `null`— para que las dos mitades de
-- la promesa tengan la misma respuesta en el caso imposible y en el real.
create or replace function public.business_member_session_inside_promise(
  p_session_ttl_hours integer,
  p_last_authenticated_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_session_ttl_hours = 0
      or (
        p_last_authenticated_at is not null
        and public.business_member_session_expires_at(
              p_session_ttl_hours,
              p_last_authenticated_at
            ) >= now()
      );
$$;

revoke all on function public.business_member_session_inside_promise(integer, timestamptz)
  from public, anon;
grant execute on function public.business_member_session_inside_promise(integer, timestamptz)
  to authenticated, service_role;

-- ─── EL GRANT DE `service_role` A LA HERMANA, EXPLÍCITO ──────────────────────
--
-- La función nueva es `SECURITY INVOKER`: cuando la llama `service_role` —que
-- es como escribe esta API— la llamada por dentro a
-- `business_member_session_expires_at` corre COMO `service_role`, y necesita
-- EXECUTE sobre ella.
--
-- En producción ese privilegio ya está: medido en la base viva, el ACL de
-- `business_member_session_expires_at` es `{postgres, service_role,
-- authenticated}`, y el `pg_default_acl` del proyecto da `service_role` a las
-- funciones nuevas de `public`. O sea que allí esto no cambia nada.
--
-- En el ESPEJO de pruebas sí cambia, y por eso está escrito: el harness no
-- replica ese `pg_default_acl`, así que en el espejo la hermana tiene
-- `{postgres, authenticated}` y una función `SECURITY INVOKER` que la llama
-- con `service_role` recibe `42501 permission denied for function`. O sea:
-- el espejo negaría una llamada que en producción concede, y una prueba que
-- dice «esto funciona» sobre un espejo que miente es una prueba que no
-- prueba nada.
--
-- El grant es idempotente: en producción no cambia el ACL, y en el espejo lo
-- deja como el de producción.
grant execute on function public.business_member_session_expires_at(integer, timestamptz)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `business_member_session_valid`: LA QUE AUTORIZA
--
-- El cuerpo es el de `20261015024825`, con la COMBINACIÓN escrita a mano
-- sustituida por la llamada. Lo que cambia es la FORMA de la pregunta: antes
-- era `not ((expires_at is not null and expires_at < now()) or (ttl > 0 and
-- last_authenticated_at is null))` —la combinación en negativo— y ahora es la
-- misma regla, en positivo, preguntada a la función que la tiene.
--
-- La equivalencia es exacta, y se puede ver caso por caso:
--
--   ttl = 0                      → antes: not(false or false) = true   ahora: true
--   ttl > 0, sin sello            → antes: not(false or true)  = false  ahora: false
--   ttl > 0, sello vencido        → antes: not(true or false)  = false  ahora: false
--   ttl > 0, sello vigente       → antes: not(false or false) = true   ahora: true
--
-- El `coalesce(..., false)` de afuera no cambia: sin membresía activa la
-- fila no está, y sin membresía no hay sesión que esté viva.
create or replace function public.business_member_session_valid(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select mm.session_ttl_hours,
           mm.last_authenticated_at
    from public.business_members mm
    where mm.business_id = p_business_id
      and mm.user_id = auth.uid()
      -- Las mismas dos condiciones que usa `can_manage_location`, y por el mismo
      -- motivo: una fila dada de baja no es una membresía, y una deshabilitada
      -- es un negocio en el que no se puede actuar.
      and mm.deleted_at is null
      and mm.status = 'active'
    limit 1
  )
  select coalesce((
    select public.business_member_session_inside_promise(
             m.session_ttl_hours,
             m.last_authenticated_at
           )
    from m
  ), false);
$$;

revoke all on function public.business_member_session_valid(uuid) from public, anon;
grant execute on function public.business_member_session_valid(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. `can_manage_location`: LA QUE PERMITE
--
-- El cuerpo es el de `20261020152852`, con la rama de «vencida» sustituida
-- por la llamada. La rama era
--
--   when (m.expires_at is not null and m.expires_at < now())
--        or (m.session_ttl_hours > 0 and m.last_authenticated_at is null)
--   then false
--
-- y ahora es
--
--   when not public.business_member_session_inside_promise(
--          m.session_ttl_hours, m.last_authenticated_at)
--   then false
--
-- que es la misma regla escrita al revés: la que nieba es la que no está
-- dentro de la promesa.
--
-- Y por eso la CTE `member` ya no calcula `expires_at`: ese valor sólo lo
-- usaba la rama que se va, y dejarlo ahí sería código muerto que un lector
-- tomaría por una segunda definición de la cuenta.
create or replace function public.can_manage_location(p_business_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    -- Solo los datos de SESIÓN. El rol no sale de aquí: sale de abajo, de
    -- `business_member_role`, para que exista una sola definición de qué es
    -- tener acceso. La fila se busca por `(business_id, user_id)`, que es único,
    -- así que el join con `role_of` nunca puede multiplicar filas.
    --
    -- `deleted_at is null` va aquí y no solo como efecto indirecto del
    -- `member_role is null` de más abajo: el §6.3 lista esta función entre los
    -- lectores de membresías que filtran las filas borradas, y un predicado que
    -- depende de otra función es un predicado que no se ve al leer esta.
    --
    -- `expires_at` NO se calcula acá. La COMBINACIÓN —la que decide si la
    -- sesión está dentro de la promesa— la tiene
    -- `business_member_session_inside_promise`, y la ARITMÉTICA que usa por
    -- dentro la tiene `business_member_session_expires_at`. Ninguna de las dos
    -- está escrita en este cuerpo.
    select m.id,
           m.session_ttl_hours,
           m.last_authenticated_at
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  ),
  role_of as (
    select public.business_member_role(p_business_id) as member_role
  )
  select coalesce((
    select case
      when not exists (
        select 1
        from public.business_locations bl
        where bl.id = p_location_id
          and bl.business_id = p_business_id
      ) then false
      when r.member_role is null then false
      -- LA PROMESA, EN UNA LÍNEA. `session_ttl_hours = 0` se salta la
      -- comprobación, para todos los roles: es el modo "equipo propio" del
      -- §9.2. Y las dos mitades de "vencida" —con sello y vencida, o sin sello
      -- con el TTL puesto— las contesta la función, no este cuerpo.
      when not public.business_member_session_inside_promise(
             m.session_ttl_hours,
             m.last_authenticated_at
           ) then false
      -- EL DUEÑO. Y SOLO EL DUEÑO.
      --
      -- Antes esta rama era `in ('owner', 'manager')`, y con ella el `manager`
      -- recibía el negocio entero: sus lecturas, sus escrituras y todo lo
      -- demás. Ahora el `manager` llega por la rama de abajo —la del
      -- alcance— y el dueño conserva el negocio entero, que es lo que su rol
      -- significa y lo que no necesita filas de alcance para tener.
      when r.member_role = 'owner' then true
      -- EL ALCANCE: la sucursal tiene que estar en las filas vivas de
      -- `business_member_locations` de ESTE miembro. Sin filas, no hay fila que
      -- case y la respuesta es `false`: sin alcance no se alcanza nada.
      when exists (
        select 1
        from public.business_member_locations l
        where l.member_id = m.id
          and l.location_id = p_location_id
          and l.deleted_at is null
      ) then true
      else false
    end
    from member m
    cross join role_of r
  ), false);
$$;

revoke all on function public.can_manage_location(uuid, uuid) from public, anon;
grant execute on function public.can_manage_location(uuid, uuid) to authenticated, service_role;