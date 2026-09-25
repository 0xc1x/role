-- Fix slides: allow coupon type and make redirect_url/image_url nullable for coupon slides
alter table slides drop constraint if exists slides_type_check;
alter table slides add constraint slides_type_check check (type = any (array['ad'::text, 'sponsor'::text, 'tip'::text, 'info'::text, 'coupon'::text]));

-- Allow coupon slides without redirect_url/image_url (commons expects nullable)
alter table slides alter column redirect_url drop not null;
alter table slides alter column image_url drop not null;

-- Normalize empty strings to null for existing rows (optional, keeps data clean)
update slides set redirect_url = null where redirect_url = '';
update slides set image_url = null where image_url = '';