-- Auth email sync + the two auth transactional templates.
--
-- Apply with `apply_migration` (NOT `execute_sql`, NOT the dashboard). The
-- ledger `supabase_migrations.schema_migrations` is the only proof of what ran;
-- a DDL applied through the back door leaves an environment that `supabase db
-- push` will reproduce differently from what actually happened. After applying,
-- rename this file to the version the server assigned and confirm
-- `md5sum <file> == md5(statements[1])` of the ledger row. Procedure:
-- supabase/migrations/README.md.
--
-- SAFETY: reviewed for a development branch first, like every migration that
-- touches `auth`. Item 1 changes how an identity change propagates, and
-- `profiles.email` is the column every consumer-facing read resolves an account
-- by -- if item 1 is wrong, the wrong address is what the product shows a person
-- about their own account. It is additive (a new trigger, nothing dropped or
-- altered) so the rollback is a DROP TRIGGER and nothing else.
--
-- ROLLBACK NOTE
--   1. `drop trigger if exists on_auth_user_email_changed on auth.users;`
--      then `drop function if exists public.sync_profile_email_on_change();`
--      and revoke nothing (the revoke below goes with the function).
--      This is a clean, complete reversal: the trigger is new, it replaces
--      nothing, and the only state it writes is a column that was previously
--      never updated after INSERT -- so rolling it back loses no data. It
--      RESTORES the previous state where `profiles.email` is frozen at signup
--      and `PATCH /api/v1/me` must keep refusing an email change, because the
--      reason it refused (no sync) becomes true again. `AuthService.changeEmail`
--      must be disabled in the same change, not after it: with the trigger gone
--      it would still answer 202 and leave `profiles.email` permanently stale.
--   2. The two `email_templates` rows: `delete from email_templates where name
--      in ('auth-password-recovery', 'auth-email-change-confirmation');`
--      `email_sends.template_id` is `ON DELETE SET NULL`, so any row already
--      queued against them becomes un-retryable rather than being cascaded;
--      check `select count(*) from email_sends where template_id is null` before
--      deleting, and cancel those sends first if it is non-zero.
--   3. `app_config` is NOT touched by this file. The sender already exists
--      (`email.from` = notificaciones@role.ec, seeded by
--      20260830014803_seed_contact_config_and_template_retry.sql) and is
--      resolved at delivery time by `resolveOutboundFrom`, not stored on the
--      template. There is no sender column on `email_templates` to set and no
--      new configuration to roll back.

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles.email follows the GoTrue identity
-- ---------------------------------------------------------------------------
--
-- WHY THIS EXISTS. `profiles.email` is a COPY of `auth.users.email`, and until
-- now the only thing that wrote it was `handle_new_user` on AFTER INSERT. So the
-- copy was frozen at signup: an email change landed in GoTrue, `profiles.email`
-- kept the old address, and every consumer-facing read (`GET /api/v1/me`,
-- `GET /auth/me`, the business view of its customers) answered with an address
-- the person no longer owns. That is why `PATCH /api/v1/me` refused an `email`
-- change with a 422 instead of writing the column -- the refusal was correct
-- while this trigger did not exist, and it is what `POST /api/v1/auth/change-email`
-- now replaces.
--
-- `AFTER UPDATE OF email`, and the `is distinct from` guard inside it, are the
-- same belt twice: the column list means the trigger is not even considered for
-- the many UPDATEs GoTrue issues for other reasons (last_sign_in_at, refresh
-- rotation, banned_until), and the guard means an UPDATE that re-asserts the
-- same value does not move `profiles.updated_at`. Without the guard, every
-- no-op email write would make the profile look freshly edited and would race
-- with a concurrent `PATCH /me`.
--
-- `coalesce(new.email, '')` -- `profiles.email` is NOT NULL and GoTrue allows a
-- phone-only identity. A null there would raise inside the trigger and fail the
-- whole auth UPDATE, so a change nobody asked for could break sign-in. The empty
-- string is the same "no email" value `AuthService.resolveProfile` already
-- writes for a phone user, so the two writers of this column agree on what it
-- means. This platform never creates phone identities (register takes an email),
-- so in practice the coalesce never fires -- it is here so the trigger cannot be
-- the thing that turns a GoTrue admin action into an outage.
--
-- `security definer`: the trigger runs as the function owner, not as the role
-- that fired it. The `authenticated` role has `update (email)` on `profiles`
-- (20260925155153) but the trigger must fire on EVERY path that changes an
-- identity -- GoTrue's own admin API, an edge function, the dashboard -- and those
-- run under roles that have no such grant.
create or replace function public.sync_profile_email_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Guarded: only a real change writes, so an UPDATE that re-asserts the same
  -- address leaves both the column and `updated_at` alone.
  if new.email is not distinct from old.email then
    return new;
  end if;

  update public.profiles
     set email = coalesce(new.email, ''),
         updated_at = now()
   where id = new.id;

  return new;
end;
$fn$;

comment on function public.sync_profile_email_on_change() is
  'Copies a changed GoTrue address into the public profile copy. AFTER UPDATE OF email, guarded on an actual change. search_path is pinned empty so a SECURITY DEFINER function cannot be redirected through a schema a caller controls and used to hijack the update; every object it touches is schema-qualified.';

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email_on_change();

-- Same posture as `handle_new_user`: a trigger function is not something a
-- client role should be able to call directly, and revoking EXECUTE keeps that
-- explicit rather than relying on the trigger being the only way in.
revoke execute on function public.sync_profile_email_on_change()
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The two auth transactional templates
-- ---------------------------------------------------------------------------
--
-- Both are transactional (`email_sends.type = 'transactional'`), enqueued by
-- `AuthService` and drained by `CampaignsCron` -> `processTransactionalBatch`.
-- NO SENDER IS STORED HERE because `email_templates` has no sender column and
-- the cron resolves the From header at delivery time from
-- `app_config['email.from']` via `resolveOutboundFrom` -- the same lookup the
-- contact module uses. That is also why this file creates no `app_config` row.
--
-- Variables are the `{{name}}` form `RendererService.renderVariables` expects.
-- Its rule is that a value is HTML-escaped UNLESS the key ends in `_url`: so
-- `recovery_url` is substituted raw (it is machine-generated by Supabase and is
-- an href) while `nombre` and `new_email` are escaped, which matters because
-- both are user-supplied.
--
-- `auth-password-recovery` deliberately takes NO `nombre`. It is the one template
-- an ANONYMOUS request can trigger, so it carries no field of account data beyond
-- the link: reading `profiles` to greet somebody would put a database query on
-- the unauthenticated path and put the person's name in a document a stranger
-- can cause to be sent. It greets nobody and says only what was asked for.
--
-- Layout mirrors the seeded `contacto-notificacion` row: table-less divs with
-- inline styles, a `max-width:600px` container, and the shared header/footer
-- components selected by type. Email clients strip <style> blocks, so nothing
-- here depends on one.
--
-- `where not exists` guards, exactly as the contact seed does: re-running this
-- file must not duplicate a template an operator has since edited in admin.

insert into email_templates(id, name, subject, body_html, header_id, footer_id, variables, is_active)
select gen_random_uuid(),
  'auth-password-recovery',
  'Restablece tu contrasena de Role',
  '<div style="font-family:sans-serif;color:#12241a;line-height:1.6;max-width:600px">'
  || '<h2 style="margin:0 0 12px">Restablece tu contrasena</h2>'
  || '<p style="margin:0 0 16px">Recibimos una solicitud para restablecer la contrasena de tu cuenta de Role. '
  || 'Si fuiste tu, usa el enlace de un solo uso para elegir una nueva contrasena:</p>'
  || '<p style="margin:0 0 16px"><a href="{{recovery_url}}" style="display:inline-block;padding:12px 22px;background:#371949;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">Elegir una nueva contrasena</a></p>'
  || '<p style="margin:0 0 8px;font-size:13px;color:#6b6b6b">Si el boton no aparece, copia esta direccion en tu navegador:</p>'
  || '<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{{recovery_url}}" style="color:#371949">{{recovery_url}}</a></p>'
  || '<p style="margin:0 0 8px;color:#5D4E75">El enlace caduca en unas horas y solo sirve una vez.</p>'
  || '<p style="margin:0;color:#5D4E75"><strong>Si no fuiste tu, no hagas nada:</strong> nadie puede ver tus pedidos ni cambiar tu contrasena con este correo. Tu contrasena actual sigue siendo la unica que funciona.</p>'
  || '</div>',
  (select id from email_components where type='header' and deleted_at is null limit 1),
  (select id from email_components where type='footer' and deleted_at is null limit 1),
  '["recovery_url"]'::jsonb, true
where not exists (select 1 from email_templates where name='auth-password-recovery' and deleted_at is null limit 1);

-- Addressed to the address the account is LEAVING, not the one being claimed.
-- The confirmation of the new address is GoTrue's to send; this one exists so an
-- account whose session was stolen is reported to the real owner. That
-- asymmetry is deliberate, and it is why the row is named for the request and
-- not for the new address.
insert into email_templates(id, name, subject, body_html, header_id, footer_id, variables, is_active)
select gen_random_uuid(),
  'auth-email-change-confirmation',
  'Confirmamos el cambio de correo de tu cuenta de Role',
  '<div style="font-family:sans-serif;color:#12241a;line-height:1.6;max-width:600px">'
  || '<h2 style="margin:0 0 12px">Cambio de correo solicitado</h2>'
  || '<p style="margin:0 0 16px">Hola {{nombre}},</p>'
  || '<p style="margin:0 0 16px">Alguien con tu sesion pidio cambiar el correo de tu cuenta de Role a:</p>'
  || '<p style="margin:0 0 16px"><strong>{{new_email}}</strong></p>'
  || '<p style="margin:0 0 16px">Enviamos un enlace de confirmacion a esa direccion. '
  || '<strong>El cambio solo se aplica cuando ese enlace se abre</strong>: hasta entonces tu cuenta sigue usando este correo.</p>'
  || '<p style="margin:0 0 8px;color:#5D4E75"><strong>Si no fuiste tu,</strong> no abras el enlace. Tu contrasena no cambia y tu cuenta sigue como esta; '
  || 'cambia tu contrasena desde «olvide mi contrasena» para cerrar la sesion de quien entro.</p>'
  || '<p style="margin:0;color:#5D4E75">Recibiste este mensaje porque se solicito un cambio en una cuenta de Role con este correo.</p>'
  || '</div>',
  (select id from email_components where type='header' and deleted_at is null limit 1),
  (select id from email_components where type='footer' and deleted_at is null limit 1),
  '["nombre","new_email"]'::jsonb, true
where not exists (select 1 from email_templates where name='auth-email-change-confirmation' and deleted_at is null limit 1);

commit;