-- Ciudades habilitadas para el form de contacto
insert into app_config(key, value, value_type, category, label, description, is_public, active)
values ('contact.cities', '["Quito","Guayaquil","Cuenca","Manta","Otra"]'::jsonb, 'json','contacto','Ciudades habilitadas','Lista para el select de contacto (landing)', true, true)
on conflict (key) do nothing;

-- Remitente transaccional (no público)
insert into app_config(key, value, value_type, category, label, description, is_public, active)
values ('email.from', '"notificaciones@role.ec"'::jsonb, 'email','contacto','Remitente notificaciones','From usado para contacto transaccional', false, true)
on conflict (key) do nothing;

-- Asegurar que existen header/footer básicos si no hay ninguno (para que la plantilla tenga fallback)
insert into email_components(id, name, type, html_content, is_active)
select gen_random_uuid(), 'Rolé Header', 'header', '<div style="padding:16px;background:#12241a;color:#fef9e8;font-family:sans-serif;font-size:14px"><strong>Rolé</strong> — comida que no se pierde</div>', true
where not exists (select 1 from email_components where type='header' and deleted_at is null limit 1);

insert into email_components(id, name, type, html_content, is_active)
select gen_random_uuid(), 'Rolé Footer', 'footer', '<div style="padding:16px;background:#f5f1e8;color:#6b6b6b;font-family:sans-serif;font-size:12px;text-align:center">Rolé · Quito, Ecuador · <a href="https://role.ec">role.ec</a></div>', true
where not exists (select 1 from email_components where type='footer' and deleted_at is null limit 1);

-- Plantilla de notificación de contacto (editable luego desde admin)
insert into email_templates(id, name, subject, body_html, header_id, footer_id, variables, is_active)
select gen_random_uuid(), 'contacto-notificacion', 'Nuevo contacto Rolé — {{rol}} — {{ciudad}}',
 '<div style="font-family:sans-serif;color:#12241a;line-height:1.6"><h2 style="margin:0 0 12px">Nuevo lead desde la landing</h2><ul style="padding-left:20px"><li><b>Nombre:</b> {{nombre}}</li><li><b>Email:</b> {{email}}</li><li><b>Rol:</b> {{rol}}</li><li><b>Ciudad:</b> {{ciudad}}</li></ul><p style="color:#6b6b6b;font-size:13px">Responder a {{email}} para dar seguimiento.</p></div>',
 (select id from email_components where type='header' and deleted_at is null limit 1),
 (select id from email_components where type='footer' and deleted_at is null limit 1),
 '["nombre","email","ciudad","rol"]'::jsonb, true
where not exists (select 1 from email_templates where name='contacto-notificacion' and deleted_at is null limit 1);