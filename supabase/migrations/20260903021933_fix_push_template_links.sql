-- Ajusta plantillas existentes para asegurar link navegable desde la PWA.
-- Ofertas del día y Negocios nuevos ya tenían link, solo Sistema estaba vacío.
update push_templates
set data = coalesce(data, '{}'::jsonb) || '{"link": "/"}'::jsonb,
    updated_at = now()
where name = 'Sistema · Aviso importante'
  and coalesce(data->>'link','') = '';

-- Saneamiento idempotente: asegura que ninguna plantilla quede sin link
update push_templates
set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('link', '/'),
    updated_at = now()
where deleted_at is null
  and coalesce(data->>'link','') = ''
  and data is not null;