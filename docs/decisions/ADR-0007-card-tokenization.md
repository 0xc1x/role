# ADR 0007 — Tokenización de tarjetas (PCI DSS)

- Nunca almacenar PAN/CVV. Solo `payment_methods {gateway_token, brand, last4, exp_month, exp_year, holder_name}` tokenizado por gateway (place_to_pay/stripe).
- Tabla `payment_methods` con RLS owner-only (`user_id = auth.uid()`). Móvil escribe directo a Supabase (ADR-0002); secretos del gateway solo en backend (excepción documentada).
- Scaffold: list/setDefault/delete operativos; alta muestra "Próximamente" hasta SDK del gateway — jamás form propio con PAN.
- Checkout móvil selecciona entre efectivo y tarjetas guardadas (sin cobro real hasta gateway).
