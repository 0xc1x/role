-- ============================================
-- FASE 2.9b: Seed businesses + business hours
-- ============================================

INSERT INTO public.businesses (id, owner_id, name, type, slug, image, cover_image, description, address, phone, email, website, latitude, longitude, commission_rate, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Panadería Dulce Hogar', 'bakery', 'panaderia-dulce-hogar',
   'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
   'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800',
   'Pan fresco y pastelería artesanal. Reducimos desperdicio ofreciendo nuestros excedentes con descuento.',
   'Calle 72 #10-34, Bogotá', '+57 1 300 2222', 'contacto@dulcehogar.com', 'https://dulcehogar.com',
   4.6590, -74.0592, 0.1000, true),

  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   'Sushi Express', 'restaurant', 'sushi-express',
   'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400',
   'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800',
   'Sushi fresco preparado al momento. Ofrecemos nuestros excedentes del día con hasta 60% de descuento.',
   'Carrera 13 #85-68, Bogotá', '+57 1 300 3333', 'info@sushiexpress.com', 'https://sushiexpress.com',
   4.6700, -74.0540, 0.1000, true),

  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
   'Café Origen', 'cafe', 'cafe-origen',
   'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400',
   'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
   'Café de especialidad colombiano. Nuestros excedentes de repostería y sándwiches a precio solidario.',
   'Calle 79 #7-45, Bogotá', '+57 1 300 4444', 'hola@cafeorigen.com', 'https://cafeorigen.com',
   4.6640, -74.0570, 0.1000, true),

  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004',
   'Pizzería Napoli', 'restaurant', 'pizzeria-napoli',
   'https://images.unsplash.com/photo-1513104890138-7c749659bd59?w=400',
   'https://images.unsplash.com/photo-1513104890138-7c749659bd59?w=800',
   'Pizza artesanal al horno de leña. Nuestras porciones del día con descuento para evitar desperdicio.',
   'Calle 85 #12-50, Bogotá', '+57 1 300 5555', 'info@pizzerianapoli.com', 'https://pizzerianapoli.com',
   4.6680, -74.0530, 0.1200, true);

-- Business hours
INSERT INTO public.business_hours (business_id, day, open_time, close_time, is_closed) VALUES
  -- Panadería Dulce Hogar
  ('d0000000-0000-0000-0000-000000000001', 'monday', '06:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'tuesday', '06:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'wednesday', '06:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'thursday', '06:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'friday', '06:00', '21:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'saturday', '07:00', '21:00', false),
  ('d0000000-0000-0000-0000-000000000001', 'sunday', '07:00', '14:00', false),
  -- Sushi Express
  ('d0000000-0000-0000-0000-000000000002', 'monday', '11:30', '22:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'tuesday', '11:30', '22:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'wednesday', '11:30', '22:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'thursday', '11:30', '22:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'friday', '11:30', '23:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'saturday', '12:00', '23:00', false),
  ('d0000000-0000-0000-0000-000000000002', 'sunday', '12:00', '21:00', false),
  -- Café Origen
  ('d0000000-0000-0000-0000-000000000003', 'monday', '07:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'tuesday', '07:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'wednesday', '07:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'thursday', '07:00', '20:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'friday', '07:00', '21:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'saturday', '08:00', '21:00', false),
  ('d0000000-0000-0000-0000-000000000003', 'sunday', '08:00', '18:00', false),
  -- Pizzería Napoli
  ('d0000000-0000-0000-0000-000000000004', 'monday', '11:00', '22:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'tuesday', '11:00', '22:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'wednesday', '11:00', '22:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'thursday', '11:00', '22:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'friday', '11:00', '23:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'saturday', '12:00', '23:00', false),
  ('d0000000-0000-0000-0000-000000000004', 'sunday', '12:00', '21:00', false);