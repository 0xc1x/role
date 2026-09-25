-- Restore the client write grant on offers.stock.
--
-- Migration 20260925163235 revoked UPDATE(stock) on public.offers from client
-- roles, reasoning that stock is only ever moved by the server-side reservation
-- RPCs (reserve_offer / cancel_order / expireStale). That reasoning was wrong
-- and it broke a designed product flow:
--
--   * public.check_offer_expiry() is a BEFORE UPDATE OF stock trigger whose
--     entire purpose is to translate a *client* stock change into an is_active
--     transition: stock -> 0 deactivates the offer, and 0 -> >0 reactivates it
--     while the pickup window is still open.
--   * The mobile business panel writes offers straight to PostgREST with the
--     user JWT (ADR-0002: the API is a BFF for admin/landing, not for mobile).
--     There is therefore no server-side path by which a merchant could restock,
--     pause, or resume their own offer.
--
-- Denying UPDATE(stock) removed the merchant's only inventory control while
-- closing no real trust boundary: initial_stock is itself client-writable on
-- INSERT, so client authority over stock was never a boundary in the first
-- place. A stock <= initial_stock guard would add no protection, because the
-- client already chooses initial_stock.
--
-- What stays closed is the actual audit finding: the derived columns.
-- discount_percentage is a GENERATED ALWAYS expression, and rating /
-- review_count are maintained by review triggers. All three remain
-- non-writable by client roles.
--
-- ROLLBACK: revoking this grant reintroduces a broken deactivation and
-- restock flow for business owners. If this grant is reverted, the stock
-- columns must be moved behind a SECURITY DEFINER RPC in the same change.

begin;

grant update (stock) on table public.offers to authenticated;

comment on column public.offers.stock is
  'Available units. Client-writable by the owning business (ADR-0002) so a merchant can restock, pause (stock=0) or resume an offer; check_offer_expiry() maps stock transitions to is_active.';

commit;
