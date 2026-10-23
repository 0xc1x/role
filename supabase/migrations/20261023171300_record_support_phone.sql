
-- Registra el teléfono de soporte real del operador: `+593 98 897 3278`.
--
-- QUÉ HAY EN LA BASE
--
-- `app_config.support.phone` vale `+593 99 000 0000`: un placeholder con el
-- prefijo de Ecuador correcto y los dígitos locales en cero —un número que
-- nadie atiende—. La propia descripción de la fila lo anuncia: "(placeholder
-- EC, editable)". Lo sembró `20260821205638` (con `+52 55 0000 0000`) y lo
-- movió a ese placeholder `20261001054104`; NINGUNA fila del ledger tiene el
-- número real, porque era una decisión de negocio que faltaba tomar: no se
-- puede inventar un número, y una migración no puede tomarla por el
-- operador. La deuda la documentó `docs/security-debt.md` §7.
--
-- El operador la tomó el 2026-10-23: el teléfono de soporte es
-- `+593 98 897 3278` —los mismos dígitos de "+5939 889 73278", con el
-- agrupamiento que el repo usa desde `20261001054104` (`+593 99 000 0000`):
-- tres, tres y cuatro dígitos tras el `+593`—.
--
-- QUÉ CAMBIA EN PRODUCCIÓN
--
-- Dos cosas, y sólo dos, en la fila `support.phone`:
--
--   1. `value` pasa de `+593 99 000 0000` a `+593 98 897 3278`. Es el valor
--      que gana hoy, porque los dos lectores del botón "Llamar" leen
--      `useConfigValue("support.phone", ...)`: `app/(consumer)/profile/help.tsx`
--      y `app/business/[id]/help.tsx`.
--   2. `description` deja de decir "(placeholder EC, editable)": ya no lo
--      es, y una fila que se describe como placeholder editables lleva
--      puesta la misma mentira vieja con forma nueva.
--
-- `value_type` ('phone'), `is_public` y `active` no se tocan: la fila ya era
-- pública y activa, y el formulario del panel la edita igual.
--
-- POR QUÉ UN ARCHIVO NUEVO Y NO UNA EDICIÓN
--
-- `20261001054104` ya corrió y su `md5sum` coincide con
-- `md5(statements[1])` del ledger: esa coincidencia es la prueba de lo que
-- corrió, y editarla la destruiría. La corrección va en un archivo nuevo,
-- que es lo que este es.
--
-- Y el fallback de `strings.helpCenter.supportPhone` (más el placeholder de
-- teléfono del formulario de `app-config` del panel y los pins de
-- `operator-identity.test.ts`) viven en el código, no en la base: este
-- archivo no los toca, porque se mueven en el commit que registra esta
-- migración — el código y su dato tienen que decir lo mismo, o el fallback,
-- que es lo que ve un arranque sin red, mentiría distinto a la fila.
--
-- IDEMPOTENTE
--
-- Correrlo dos veces no cambia nada: el `update` sólo toca la fila mientras
-- su valor siga siendo el viejo, y tras la primera pasada la `description`
-- queda en su texto final. La puerta del final convierte la promesa en algo
-- verificable en vez de algo declarado: falla con error propio si tras el
-- `update` la fila no queda en el número del operador y activa — lo que
-- protege el replay (`supabase db push` a un entorno nuevo, donde la fila la
-- siembran `20260821205638` y `20261001054104`) y delata cualquier
-- desaparición futura de la clave.

begin;

update public.app_config
   set value = to_jsonb('+593 98 897 3278'::text),
       description = 'Teléfono mostrado en el centro de ayuda',
       updated_at = now()
 where key = 'support.phone'
   and value #>> '{}' <> '+593 98 897 3278';

do $verify$
begin
  if not exists (
    select 1 from public.app_config
     where key = 'support.phone'
       and value #>> '{}' = '+593 98 897 3278'
       and active
  ) then
    raise exception 'support.phone is not the operator phone (+593 98 897 3278)';
  end if;
end $verify$;

commit;
