-- ─────────────────────────────────────────────────────────────────────────────
-- `business_ownership` se retira: diecinueve policies y una tabla
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ ESTA MIGRACIÓN ES LA QUE NO SE PUEDE DESHACER ────────────────────
--
-- Porque `create table` no reconstruye una tabla con datos y policies. Todo lo
-- demás de este plan se deshace con una migración nueva; esta se deshace
-- recreando la tabla VACÍA y restaurando las policies desde los archivos
-- sellados — y los negocios volverían a tener dueño, pero el histórico de
-- propiedad se pierde.
--
-- Por eso el orden es el que es, y por eso cada paso se verificó antes de
-- aplicar:
--
--   1. el móvil dejó de leer la tabla (su panel lee `business_members`);
--   2. los cinco lectores de la API dejaron de leerla;
--   3. la migración anterior la dejó de escribir —trigger y funciones— y
--      reescribió las dos lectoras de correo que también la nombraban;
--   4. y ahora la tabla cae.
--
-- ─── LAS DIECINUEVE, UNA POR UNA Y POR SU NOMBRE ───────────────────────────
--
-- No se borra «las policies que resuelven por `business_ownership`»: se borra
-- cada una por su nombre, en las doce tablas donde estaban. Un `drop policy`
-- sin nombre es un `drop policy` sobre la primera que encuentre, y una policy
-- que se queda es una policy que concede a un dueño que ya no existe.
--
-- La lista se midió contra `pg_policies` antes de escribir esto: DIECINUEVE,
-- en doce tablas. Y las dos policies de la propia tabla —«Owners can view own
-- business ownership» y «Admins can view all business ownership»— no están en
-- esta lista porque NO nombran la tabla en su predicado (`owner_id =
-- auth.uid()` y `my_role() = 'admin'`), y caen con ella.
--
-- ─── LO QUE QUEDA EN PIE, Y POR QUÉ ─────────────────────────────────────────
--
-- La generación nueva del §6.2, que resuelve el acceso por
-- `business_member_role(business_id) in ('owner','manager')` y por
-- `can_manage_location`. Se verificaron equivalentes a la vieja PARA UN DUEÑO
-- CON LA SESIÓN VIVA, que es lo único que los tests miden. No lo eran para un
-- dueño con la sesión vencida: las policies viejas no llevan TTL y seguían
-- concediendo. Por eso el drop no podía ser un `drop table` ordinario: la
-- generación nueva tenía que ser la única antes de que esta se fuera, y ya lo
-- es.
--
-- ─── EL MECANISMO DE SEGURIDAD DEL `drop` ───────────────────────────────────
--
-- Si algo en la base todavía apuntara a `business_ownership`, este `drop`
-- fallaría con `23503` y NOMBRARÍA la dependencia, y la migración no se
-- aplicaría —es una transacción—. Ese es el mecanismo: si algo se olvidó, la
-- tabla no se cae.

-- ─── LAS DIECINUEVE ──────────────────────────────────────────────────────────
--
-- 12 en `businesses`, `offers`, `orders` y compañía que resolvían el acceso
-- por una fila de `business_ownership`; 7 repartidas por las demás tablas.
-- Los nombres son los del ledger, con mayúsculas y acentos incluidos.

drop policy if exists "Owners can manage own business hours"
  on public.business_hours;

drop policy if exists "Owners can manage own business locations"
  on public.business_locations;

drop policy if exists "Business owners insert own notification preferences"
  on public.business_notification_preferences;

drop policy if exists "Business owners update own notification preferences"
  on public.business_notification_preferences;

drop policy if exists "Business owners view own notification preferences"
  on public.business_notification_preferences;

drop policy if exists "Owners can update own businesses"
  on public.businesses;

drop policy if exists "Owners can view own businesses"
  on public.businesses;

drop policy if exists "Owners can manage own coupons"
  on public.coupons;

drop policy if exists "Owners can delete offer categories"
  on public.offer_categories;

drop policy if exists "Owners can insert offer categories"
  on public.offer_categories;

drop policy if exists "Owners can delete own offers"
  on public.offers;

drop policy if exists "Owners can insert own offers"
  on public.offers;

drop policy if exists "Owners can update own offers"
  on public.offers;

drop policy if exists "Owners can view own offers"
  on public.offers;

drop policy if exists "Business can view own order events"
  on public.order_events;

drop policy if exists "Business can view own orders"
  on public.orders;

drop policy if exists "Business can view own payment intents"
  on public.payment_intents;

drop policy if exists "Business can view own payouts"
  on public.payouts;

drop policy if exists "Businesses can view their order customers"
  on public.profiles;

-- ─── Y LA TABLA ──────────────────────────────────────────────────────────────
--
-- Con ella caen sus dos policies propias, sus grants —`SELECT` para
-- `authenticated`— y sus dos foreign keys. No hay nada que revocar después:
-- los privilegios de tabla se van con la tabla.

drop table if exists public.business_ownership;
