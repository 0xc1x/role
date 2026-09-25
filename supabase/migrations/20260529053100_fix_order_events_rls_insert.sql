
-- Drop the restrictive "No direct insert on order_events" policy
DROP POLICY IF EXISTS "No direct insert on order_events" ON public.order_events;

-- Policy: Business owners can insert events for their own orders (trigger runs as calling user)
CREATE POLICY "Business can insert own order events" ON public.order_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      JOIN businesses b ON b.id = o.business_id
      WHERE o.id = order_events.order_id
        AND b.owner_id = auth.uid()
    )
  );

-- Policy: Users can insert events for their own orders (e.g. cancellation)
CREATE POLICY "Users can insert own order events" ON public.order_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = order_events.order_id
        AND o.user_id = auth.uid()
    )
  );
