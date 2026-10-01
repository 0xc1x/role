insert into public.app_config (key, value, value_type, category, label, description, is_public, active) values
  ('legal.controller_identity', '"el operador de Rolé (identidad legal pendiente de publicación)"', 'string', 'legal', 'Identidad del responsable', 'Sustituye {controllerIdentity} en términos y privacidad', true, true),
  ('legal.company_name', '"Operador de Rolé (pendiente)"', 'string', 'legal', 'Razón social', 'Nombre legal del operador, editable cuando se defina', true, true),
  ('legal.ruc', '""', 'string', 'legal', 'RUC', 'Vacío = no publicado; mobile lo oculta', true, true),
  ('legal.address', '"Quito, Ecuador (pendiente de confirmación)"', 'string', 'legal', 'Dirección', 'Ciudad/dirección del operador', true, true),
  ('legal.jurisdiction', '"tribunales de Quito, Ecuador"', 'string', 'legal', 'Jurisdicción', 'Jurisdicción aplicable', true, true)
on conflict (key) do nothing;

update public.app_config
set value = '"+593 99 000 0000"',
    description = 'Teléfono mostrado en el centro de ayuda (placeholder EC, editable)'
where key = 'support.phone';