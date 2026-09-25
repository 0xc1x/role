-- ============================================
-- FASE 2.9c: Seed offers, coupons, orders, events, reviews, favorites, payouts, payment_intents
-- ============================================

-- Offers
INSERT INTO public.offers (id, business_id, title, description, image, category, original_price, discounted_price, stock, initial_stock, pickup_start, pickup_end, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'Paquete de Pan Artesanal', '6 unidades de pan fresco del día: pan de masa madre, integral y de avena',
   'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
   'bakery', 18000, 9000, 8, 8,
   now() + interval '2 hours', now() + interval '6 hours', true),

  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'Caja de Pastelería Variada', '8 postres surtidos: croissants, medialunas, galletas y brownies',
   'https://images.unsplash.com/photo-1483695028939-5bb13fab3f04?w=400',
   'bakery', 35000, 17500, 5, 5,
   now() + interval '2 hours', now() + interval '6 hours', true),

  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002',
   'Combo Sushi 24 Piezas', '12 california + 6 philadelphia + 6 tempura roll. Salsa de soja incluida',
   'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400',
   'japanese', 55000, 25000, 3, 3,
   now() + interval '3 hours', now() + interval '7 hours', true),

  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002',
   'Bowl Poke Salmón', 'Bowl de arroz con salmón fresco, aguacate, edamame y salsa ponzu',
   'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
   'japanese', 32000, 16000, 4, 4,
   now() + interval '3 hours', now() + interval '7 hours', true),

  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003',
   'Desayuno Completo Café', 'Café de especialidad + sándwich de jamón y queso + jugo natural',
   'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400',
   'cafe', 22000, 11000, 6, 6,
   now() + interval '1 hour', now() + interval '5 hours', true),

  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003',
   'Torta de Chocolate + Café', 'Porción de torta casera de chocolate con café americano',
   'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
   'cafe', 16000, 8000, 10, 10,
   now() + interval '1 hour', now() + interval '5 hours', true),

  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000004',
   'Pizza Margherita Mediana', 'Pizza artesanal al horno de leña: salsa tomate, mozzarella, albahaca',
   'https://images.unsplash.com/photo-1513104890138-7c749659bd59?w=400',
   'italian', 38000, 19000, 4, 4,
   now() + interval '4 hours', now() + interval '8 hours', true),

  ('e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000004',
   'Lasagna Boloñesa', 'Porción generosa de lasagna casera con ensalada verde',
   'https://images.unsplash.com/photo-1574894909486-742f4d51fae1?w=400',
   'italian', 28000, 14000, 3, 3,
   now() + interval '4 hours', now() + interval '8 hours', true);

-- Coupons
INSERT INTO public.coupons (business_id, code, name, type, value, min_order_amount, max_uses, is_active, expires_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'PAN10', '10% en panadería', 'percentage', 10, 0, 100, true, now() + interval '30 days'),
  ('d0000000-0000-0000-0000-000000000002', 'SUSHI5K', '$5,000 off en sushi', 'fixed', 5000, 20000, 50, true, now() + interval '30 days'),
  ('d0000000-0000-0000-0000-000000000003', 'CAFE15', '15% en café', 'percentage', 15, 10000, 80, true, now() + interval '30 days'),
  ('d0000000-0000-0000-0000-000000000004', 'PIZZA20', '20% en pizza', 'percentage', 20, 15000, 60, true, now() + interval '15 days');

-- Orders
INSERT INTO public.orders (id, user_id, offer_id, business_id, order_number, status, price, original_price, pickup_code, pickup_time, created_at) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'FD-20260507-001', 'completed', 9000, 18000, 'ABC123', now() - interval '2 days', now() - interval '3 days'),

  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002',
   'FD-20260507-002', 'completed', 25000, 55000, 'DEF456', now() - interval '1 day', now() - interval '2 days'),

  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003',
   'FD-20260507-003', 'picked_up', 11000, 22000, 'GHI789', now() - interval '1 hour', now() - interval '1 day'),

  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000004',
   'FD-20260507-004', 'confirmed', 19000, 38000, 'JKL012', NULL, now() - interval '30 minutes'),

  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003',
   'FD-20260507-005', 'pending', 8000, 16000, 'MNO345', NULL, now() - interval '10 minutes');

-- Order events
INSERT INTO public.order_events (order_id, status, previous_status, reason, created_at) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'pending', NULL, 'Reserva creada', now() - interval '3 days'),
  ('f0000000-0000-0000-0000-000000000001', 'confirmed', 'pending', 'Pago confirmado', now() - interval '3 days' + interval '5 minutes'),
  ('f0000000-0000-0000-0000-000000000001', 'ready_for_pickup', 'confirmed', 'Listo para recoger', now() - interval '3 days' + interval '1 hour'),
  ('f0000000-0000-0000-0000-000000000001', 'picked_up', 'ready_for_pickup', 'Recogido por el usuario', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000001', 'completed', 'picked_up', 'Orden completada', now() - interval '2 days' + interval '1 hour'),

  ('f0000000-0000-0000-0000-000000000002', 'pending', NULL, 'Reserva creada', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000002', 'confirmed', 'pending', 'Pago confirmado', now() - interval '2 days' + interval '3 minutes'),
  ('f0000000-0000-0000-0000-000000000002', 'completed', 'confirmed', 'Orden completada', now() - interval '1 day'),

  ('f0000000-0000-0000-0000-000000000003', 'pending', NULL, 'Reserva creada', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000003', 'confirmed', 'pending', 'Pago confirmado', now() - interval '1 day' + interval '2 minutes'),
  ('f0000000-0000-0000-0000-000000000003', 'picked_up', 'confirmed', 'Recogido por el usuario', now() - interval '1 hour'),

  ('f0000000-0000-0000-0000-000000000004', 'pending', NULL, 'Reserva creada', now() - interval '30 minutes'),
  ('f0000000-0000-0000-0000-000000000004', 'confirmed', 'pending', 'Pago confirmado', now() - interval '25 minutes'),

  ('f0000000-0000-0000-0000-000000000005', 'pending', NULL, 'Reserva creada', now() - interval '10 minutes');

-- Reviews
INSERT INTO public.reviews (user_id, business_id, order_id, rating, comment) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 5, 'Pan increíble, super fresco!'),
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000002', 4, 'Sushi delicioso, buena relación calidad-precio'),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000003', 5, 'El mejor café de la zona, desayuno completo y rico');

-- Favorites
INSERT INTO public.favorites (user_id, offer_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000007');

-- Payouts
INSERT INTO public.payouts (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status, paid_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', '2026-04-28', '2026-05-04', 450000, 45000, 405000, 'paid', now() - interval '3 days'),
  ('d0000000-0000-0000-0000-000000000002', '2026-04-28', '2026-05-04', 780000, 78000, 702000, 'paid', now() - interval '3 days'),
  ('d0000000-0000-0000-0000-000000000003', '2026-04-28', '2026-05-04', 320000, 32000, 288000, 'paid', now() - interval '3 days'),
  ('d0000000-0000-0000-0000-000000000004', '2026-04-28', '2026-05-04', 560000, 67200, 492800, 'paid', now() - interval '3 days'),
  ('d0000000-0000-0000-0000-000000000001', '2026-05-05', '2026-05-11', 380000, 38000, 342000, 'pending', NULL),
  ('d0000000-0000-0000-0000-000000000002', '2026-05-05', '2026-05-11', 620000, 62000, 558000, 'pending', NULL);

-- Payment intents
INSERT INTO public.payment_intents (order_id, gateway, gateway_id, amount, currency, status) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'place_to_pay', 'ptp-seed-001', 9000, 'COP', 'approved'),
  ('f0000000-0000-0000-0000-000000000002', 'place_to_pay', 'ptp-seed-002', 25000, 'COP', 'approved'),
  ('f0000000-0000-0000-0000-000000000003', 'place_to_pay', 'ptp-seed-003', 11000, 'COP', 'approved'),
  ('f0000000-0000-0000-0000-000000000004', 'place_to_pay', 'ptp-seed-004', 19000, 'COP', 'approved'),
  ('f0000000-0000-0000-0000-000000000005', 'place_to_pay', NULL, 8000, 'COP', 'pending');