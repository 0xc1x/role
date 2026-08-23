# ADR 0006 — Comisiones y cortes quincenales

- Comisión por negocio `businesses.commission_rate` (fracción, default 0.10). Snapshot por orden en `orders.commission_rate / platform_fee / net_amount` al crear (precio tras cupón). Fee = round(price*rate,2).
- Devengo por trigger `trg_accrue_order_earnings` al pasar a `completed` (raíz única: cubre `validate_pickup_code` y API).
- Cortes: `generate_payouts()` agrupa `orders` completed sin `payout_id` por negocio, crea `payouts` pending y recalcula `businesses.balance` como suma pendiente. Cron pg_cron `0 3 1,16 * *` + endpoint admin `POST /payouts/generate` y `PATCH /payouts/:id/pay`.
- Ponytail: ledger lite sin doble entrada; upgrade a wallets si hay reembolsos parciales.
