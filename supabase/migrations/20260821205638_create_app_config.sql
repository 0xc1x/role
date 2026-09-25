-- Tabla de configuración gestionable del ecosistema Rolé.
-- Valores de negocio/contenido que antes vivían hardcodeados en mobile/landing/admin/api.
create table public.app_config (
  key text primary key check (key ~ '^[a-z0-9]+(\.[a-z0-9_]+)*$'),
  value jsonb not null,
  value_type text not null default 'string' check (value_type in ('string', 'text', 'number', 'boolean', 'email', 'url', 'phone')),
  category text not null default 'general',
  label text not null,
  description text,
  is_public boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_config is 'Configuración dinámica de la plataforma (contacto, tarifas, comisiones, reglas, links). Leída por mobile (Supabase directo) y landing/admin (API BFF).';

alter table public.app_config enable row level security;

-- Lectura pública: solo filas activas y marcadas públicas (mobile anon + landing via API).
create policy "Public can read active app config"
  on public.app_config
  for select
  to anon, authenticated
  using (active and is_public);

-- Admins pueden leer todo y escribir.
create policy "Admins manage app config"
  on public.app_config
  for all
  to authenticated
  using (auth_helpers.my_role() = 'admin')
  with check (auth_helpers.my_role() = 'admin');

-- Índice para filtros por categoría en el grid admin.
create index app_config_category_idx on public.app_config (category);

-- ─── Seed inicial: valores actuales del negocio ───────────────────────────
insert into public.app_config (key, value, value_type, category, label, description) values
  -- Contacto / soporte
  ('support.email', '"soporte@role.app"', 'email', 'contacto', 'Email de soporte', 'Correo de soporte mostrado en la app móvil y landing'),
  ('support.phone', '"+52 55 1234 5678"', 'phone', 'contacto', 'Teléfono de soporte', 'Teléfono mostrado en el centro de ayuda'),
  ('support.hours_weekdays', '"Lunes a Viernes: 8:00 - 20:00"', 'string', 'contacto', 'Horario entre semana', 'Horario de atención lunes a viernes'),
  ('support.hours_weekend', '"Sábados: 9:00 - 18:00"', 'string', 'contacto', 'Horario fin de semana', 'Horario de atención sábados'),
  ('support.sla_hours', '24', 'number', 'contacto', 'SLA de respuesta (horas)', 'Tiempo máximo prometido de respuesta a consultas'),
  ('contact.hola_email', '"hola@role.app"', 'email', 'contacto', 'Email general (hola@)', 'Contacto general de la landing'),
  ('contact.negocios_email', '"negocios@role.app"', 'email', 'contacto', 'Email negocios', 'Contacto comercial/onboarding de negocios'),
  ('legal.contact_email', '"legal@role.app"', 'email', 'contacto', 'Email legal', 'Contacto en términos y condiciones'),
  ('privacy.contact_email', '"privacidad@role.app"', 'email', 'contacto', 'Email privacidad', 'Contacto en la política de privacidad'),

  -- Tarifas y comisiones
  ('fees.service_fee_amount', '0.25', 'number', 'financiero', 'Tarifa de servicio al usuario ($)', 'Monto fijo cobrado al usuario por orden. Ajustar según margen y competencia'),
  ('fees.business_commission_percent', '15', 'number', 'financiero', 'Comisión % al negocio', 'Porcentaje de comisión sobre cada venta'),
  ('fees.commission_min_amount', 'null', 'number', 'financiero', 'Comisión mínima ($)', 'Piso de comisión para proteger margen en tickets bajos (opcional)'),
  ('fees.commission_max_amount', 'null', 'number', 'financiero', 'Comisión máxima ($)', 'Techo de comisión por orden (opcional)'),
  ('fees.vat_percent', '15', 'number', 'financiero', 'IVA aplicable (%)', 'IVA vigente aplicado a tarifas/comisiones'),

  -- Cancelaciones
  ('cancellation.window_minutes', '10', 'number', 'reglas', 'Ventana de cancelación (minutos)', 'Minutos máximos para cancelar después de aceptar la orden'),
  ('cancellation.max_per_7d', '3', 'number', 'reglas', 'Límite cancelaciones 7 días', 'Cancelaciones permitidas por usuario en 7 días'),
  ('cancellation.max_per_30d', '10', 'number', 'reglas', 'Límite cancelaciones 30 días', 'Cancelaciones permitidas por usuario en 30 días'),
  ('cancellation.max_rate_percent', '10', 'number', 'reglas', '% máximo cancelaciones negocio', 'Tasa máxima de cancelación permitida a un negocio antes de ranking/suspensión'),

  -- Pagos al negocio
  ('payouts.cutoff_days', '3', 'number', 'financiero', 'Corte automático (días)', 'Días de corte para el ciclo de pagos'),
  ('payouts.days_of_month', '"5,20"', 'string', 'financiero', 'Días de transferencia', 'Días del mes en que se ejecutan transferencias quincenales'),
  ('payouts.processing_hours', '"48-72"', 'string', 'financiero', 'Procesamiento (horas hábiles)', 'Rango de horas hábiles para reflejar depósitos'),

  -- Geolocalización
  ('geo.default_radius_km', '10', 'number', 'geolocalizacion', 'Radio búsqueda negocios (km)', 'Radio por defecto al buscar negocios'),
  ('geo.nearby_radius_km', '5', 'number', 'geolocalizacion', 'Radio ofertas cercanas (km)', 'Radio por defecto para ofertas cercanas'),
  ('geo.max_notification_radius_km', '50', 'number', 'geolocalizacion', 'Radio máximo notificaciones (km)', 'Tope del slider de radio de notificaciones'),
  ('geo.distance_options_km', '[2,5,10]', 'number', 'geolocalizacion', 'Opciones de filtro distancia (km)', 'Valores del filtro de distancia en explorar'),
  ('geo.default_lat', '-0.22985', 'number', 'geolocalizacion', 'Latitud default', 'Centro inicial del mapa (Quito)'),
  ('geo.default_lng', '-78.52495', 'number', 'geolocalizacion', 'Longitud default', 'Centro inicial del mapa (Quito)'),

  -- Links externos / redes sociales
  ('social.instagram_url', '"https://instagram.com/"', 'url', 'links', 'Instagram', 'URL del perfil de Instagram'),
  ('social.twitter_url', '"https://x.com/"', 'url', 'links', 'X (Twitter)', 'URL del perfil de X'),
  ('social.linkedin_url', '"https://linkedin.com/"', 'url', 'links', 'LinkedIn', 'URL del perfil de LinkedIn'),
  ('links.app_store_url', '"https://apps.apple.com/"', 'url', 'links', 'App Store', 'Link de descarga iOS'),
  ('links.google_play_url', '"https://play.google.com/"', 'url', 'links', 'Google Play', 'Link de descarga Android'),

  -- Marketing
  ('marketing.tagline', '"Comida deliciosa, precios increíbles"', 'string', 'marketing', 'Tagline', 'Eslogan principal usado en app y landing'),
  ('marketing.hero_image_url', '"https://picsum.photos/seed/role-market/1920/1280"', 'url', 'marketing', 'Imagen hero landing', 'Imagen de fondo del hero'),

  -- Legal
  ('legal.terms_updated_at', '"2026-04-19"', 'string', 'legal', 'Última actualización T&C', 'Fecha mostrada en términos y condiciones'),
  ('legal.privacy_updated_at', '"2026-04-19"', 'string', 'legal', 'Última actualización privacidad', 'Fecha mostrada en la política de privacidad');