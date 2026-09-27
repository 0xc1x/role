-- Restore the accents the auth email templates lost in transit.
--
-- 20260927164449 seeded two transactional templates. The statement that reached
-- the database was typed by hand rather than passed through from the file, and
-- the typing dropped every accented character: the password recovery mail went
-- live as "Restablece tu contrasena de Role" and the change-of-address mail as
-- "Confirmamos el cambio de correo de tu cuenta de Role".
--
-- These are the only user-facing Spanish strings in the database missing their
-- diacritics, which is what makes it a defect rather than a house style: the
-- seeded templates, the contact copy and the notification emails all carry them.
--
-- This file re-applies both rows from the SAME text the committed migration
-- holds, extracted mechanically rather than retyped, so the two cannot drift
-- again. The committed migration stays as the record of what ran; this one is
-- the correction.
--
-- UPDATE, not INSERT: the rows already exist, and the seeding migration used a
-- `where not exists` guard precisely so a re-run would not duplicate them. An
-- INSERT here would match nothing and be a silent no-op.
--
-- Only subject and body_html move. The header/footer bindings, the declared
-- variables and is_active were correct, and an operator may have edited them in
-- the panel since, so they are left alone.
--
-- Idempotent: re-running restores the same text.

begin;

update public.email_templates
   set subject = 'Restablece tu contraseña de Rolé',
       body_html = '<div style="font-family:sans-serif;color:#12241a;line-height:1.6;max-width:600px">'
    || '<h2 style="margin:0 0 12px">Restablece tu contraseña</h2>'
    || '<p style="margin:0 0 16px">Recibimos una solicitud para restablecer la contraseña de tu cuenta de Rolé. '
    || 'Si fuiste tú, usa el enlace de un solo uso para elegir una nueva contraseña:</p>'
    || '<p style="margin:0 0 16px"><a href="{{recovery_url}}" style="display:inline-block;padding:12px 22px;background:#371949;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">Elegir una nueva contraseña</a></p>'
    || '<p style="margin:0 0 8px;font-size:13px;color:#6b6b6b">Si el botón no aparece, copia esta dirección en tu navegador:</p>'
    || '<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{{recovery_url}}" style="color:#371949">{{recovery_url}}</a></p>'
    || '<p style="margin:0 0 8px;color:#5D4E75">El enlace caduca en unas horas y solo sirve una vez.</p>'
    || '<p style="margin:0;color:#5D4E75"><strong>Si no fuiste tú, no hagas nada:</strong> nadie puede ver tus pedidos ni cambiar tu contraseña con este correo. Tu contraseña actual sigue siendo la única que funciona.</p>'
    || '</div>',
       updated_at = now()
 where name = 'auth-password-recovery'
   and deleted_at is null;

update public.email_templates
   set subject = 'Confirmamos el cambio de correo de tu cuenta de Rolé',
       body_html = '<div style="font-family:sans-serif;color:#12241a;line-height:1.6;max-width:600px">'
    || '<h2 style="margin:0 0 12px">Cambio de correo solicitado</h2>'
    || '<p style="margin:0 0 16px">Hola {{nombre}},</p>'
    || '<p style="margin:0 0 16px">Alguien con tu sesión pidió cambiar el correo de tu cuenta de Rolé a:</p>'
    || '<p style="margin:0 0 16px"><strong>{{new_email}}</strong></p>'
    || '<p style="margin:0 0 16px">Enviamos un enlace de confirmación a esa dirección. '
    || '<strong>El cambio solo se aplica cuando ese enlace se abre</strong>: hasta entonces tu cuenta sigue usando este correo.</p>'
    || '<p style="margin:0 0 8px;color:#5D4E75"><strong>Si no fuiste tú,</strong> no abras el enlace. Tu contraseña no cambia y tu cuenta sigue como está; '
    || 'cambia tu contraseña desde «olvidé mi contraseña» para cerrar la sesión de quien entró.</p>'
    || '<p style="margin:0;color:#5D4E75">Recibiste este mensaje porque se solicitó un cambio en una cuenta de Rolé con este correo.</p>'
    || '</div>',
       updated_at = now()
 where name = 'auth-email-change-confirmation'
   and deleted_at is null;

-- Exact equality, not a diacritic pattern. A regex here would need escapes, and
-- 20260927164449 is already the standing reminder that a pattern can come back
-- from apply_migration altered without anybody noticing. Two literal strings
-- cannot drift like that.
do $verify$
declare
  v_subject text;
begin
  select subject into v_subject
  from public.email_templates
  where name = 'auth-password-recovery' and deleted_at is null;

  if v_subject is distinct from 'Restablece tu contraseña de Rolé' then
    raise exception 'auth-password-recovery subject is [%], expected the accented text', v_subject;
  end if;

  if exists (
    select 1 from public.email_templates
    where name in ('auth-password-recovery', 'auth-email-change-confirmation')
      and deleted_at is null
      and body_html like '%contrasena%'
  ) then
    raise exception 'a template body still contains the unaccented "contrasena"';
  end if;
end $verify$;

commit;