-- Point business-owner notifications at the real support inbox.
--
-- The seeded email_templates bodies carried negocios@role.app, but the product
-- domain is role.ec: eight app_config values (email.from, contact.hola_email,
-- contact.negocios_email, legal.contact_email, support.email, store.default,
-- store.ios_url, store.play_url) plus an Ecuadorian support phone agree on it.
-- role.app was the outlier, so a business owner reading the rejection notice was
-- pointed at an address that does not receive mail.
--
-- Only the two templates whose bodies actually print an address are touched. The
-- seed migration 20260821205638 is not edited: it is already in the ledger and
-- rewriting it would break the md5 fidelity this directory is verified against.
-- A fresh environment replays the wrong value and then this one corrects it.

begin;

update public.email_templates
   set body_html = replace(body_html, 'negocios@role.app', 'negocios@role.ec'),
       updated_at = now()
 where deleted_at is null
   and body_html like '%negocios@role.app%'
   and name in ('business-pending-owner', 'business-rejected', 'business-approved');

-- Raise if anything still points at the wrong domain, so this cannot silently
-- regress the next time a template is edited in the admin.
do $$
declare
  remaining text;
begin
  select string_agg(name, ', ') into remaining
    from public.email_templates
   where deleted_at is null
     and body_html like '%negocios@role.app%';

  if remaining is not null then
    raise exception 'business templates still reference negocios@role.app: %', remaining;
  end if;
end $$;

commit;
