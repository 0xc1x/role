-- Final authorization, public read, platform stats, and Vault dispatch correction.
begin;

do $$
declare
  legacy_src text; legacy_url text; legacy_anon text; v_secret text; v_slug text;
begin
  select p.prosrc into legacy_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_order_event_push';
  if legacy_src is null then
    if not exists (select 1 from vault.decrypted_secrets where name='internal_secret') or not exists (select 1 from vault.decrypted_secrets where name='supabase_url') or not exists (select 1 from vault.decrypted_secrets where name='supabase_anon_key') then
      raise exception 'Vault is missing required secrets and no legacy handle_order_event_push source exists. Seed Vault, then re-run.';
    end if;
    return;
  end if;
  legacy_url := (regexp_match(legacy_src, '(https://[a-z0-9-]+\.supabase\.co)'))[1];
  legacy_anon := (regexp_match(legacy_src, '(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'))[1];
  if not exists (select 1 from vault.decrypted_secrets where name='internal_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'internal_secret','Shared secret for cron to Edge dispatch; rotated by corrective migration.');
  end if;
  if legacy_url is not null and not exists (select 1 from vault.decrypted_secrets where name='supabase_url') then perform vault.create_secret(legacy_url,'supabase_url','Supabase project URL.'); end if;
  if legacy_anon is not null and not exists (select 1 from vault.decrypted_secrets where name='supabase_anon_key') then perform vault.create_secret(legacy_anon,'supabase_anon_key','Supabase anon key for internal dispatch.'); end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='internal_secret';
  if v_secret is null then raise exception 'internal_secret missing after Vault bootstrap'; end if;
  foreach v_slug in array array['handle-order-event','handle-pickup-reminders','handle-weekly-summary','dispatch-nearby-offers'] loop
    if exists (select 1 from vault.secrets where name='supabase_functions_secret_'||v_slug||'_INTERNAL_SECRET') then
      perform vault.update_secret((select id from vault.secrets where name='supabase_functions_secret_'||v_slug||'_INTERNAL_SECRET'),v_secret,'supabase_functions_secret_'||v_slug||'_INTERNAL_SECRET','INTERNAL_SECRET for '||v_slug);
    else
      perform vault.create_secret(v_secret,'supabase_functions_secret_'||v_slug||'_INTERNAL_SECRET','INTERNAL_SECRET for '||v_slug);
    end if;
  end loop;
end $$;

revoke insert, update, delete, truncate on table public.order_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.order_events from public;
drop policy if exists "Users can insert own order events" on public.order_events;
drop policy if exists "Business can insert own order events" on public.order_events;
comment on table public.order_events is 'Append-only event log. Only service_role and server-side RPCs may insert; trg_order_event_push dispatches notifications.';

revoke all on table public.businesses from anon, authenticated;
grant select (id,name,type,slug,image,cover_image,rating,review_count,description,phone,email,website,is_active,created_at,updated_at,currency) on table public.businesses to anon;
grant select (owner_id,id,name,type,slug,image,cover_image,rating,review_count,description,phone,email,website,is_active,created_at,updated_at,currency) on table public.businesses to authenticated;

revoke insert, update, delete, truncate, trigger, references on table public.offers from anon, authenticated;
grant insert (business_id,business_location_id,title,description,image,original_price,discounted_price,discount_percentage,stock,initial_stock,pickup_start,pickup_end,is_active,includes,allergens) on table public.offers to authenticated;
grant update (title,description,image,original_price,discounted_price,discount_percentage,pickup_start,pickup_end,is_active,includes,allergens) on table public.offers to authenticated;
grant delete on table public.offers to authenticated;
revoke update (stock) on table public.offers from anon, authenticated;
create index if not exists idx_offers_location_business on public.offers using btree (business_location_id,business_id);

create or replace function public.get_platform_stats() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('users',(select count(*) from auth.users),'businesses',(select count(*) from public.businesses where verification_status='approved' and is_active),'meals',(select count(*) from public.orders where status in ('completed','picked_up')));
$$;
revoke all on function public.get_platform_stats() from public; revoke all on function public.get_platform_stats() from anon; revoke all on function public.get_platform_stats() from authenticated; grant execute on function public.get_platform_stats() to service_role;

create or replace function public.get_platform_public_stats() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('users',(select count(*) from public.profiles),'businesses',(select count(*) from public.businesses where verification_status='approved' and is_active),'meals',(select count(*) from public.orders where status in ('completed','picked_up')));
$$;
revoke all on function public.get_platform_public_stats() from public; grant execute on function public.get_platform_public_stats() to anon,authenticated;
comment on function public.get_platform_public_stats() is 'Count-only platform totals; exposes no rows or platform fields.';

create or replace function public.invoke_internal_edge_function(path text, body jsonb default '{}'::jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text; v_anon text; v_secret text; v_request_id bigint;
begin
  if path not in ('handle-order-event','handle-pickup-reminders','handle-weekly-summary','dispatch-nearby-offers') then raise exception 'invoke_internal_edge_function: path is not in the allowlist'; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='supabase_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name='supabase_anon_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='internal_secret';
  if v_url is null or v_anon is null or v_secret is null then raise exception 'invoke_internal_edge_function: missing Vault secret'; end if;
  select http_post into v_request_id from net.http_post(url:=v_url||'/functions/v1/'||ltrim(path,'/'),body:=body,params:=jsonb_build_object('headers',jsonb_build_object('Content-Type','application/json','apikey',v_anon,'Authorization','Bearer '||v_anon,'x-internal-secret',v_secret)),timeout_milliseconds:=30000);
  return v_request_id;
end;
$$;
revoke all on function public.invoke_internal_edge_function(text,jsonb) from public; revoke all on function public.invoke_internal_edge_function(text,jsonb) from anon; revoke all on function public.invoke_internal_edge_function(text,jsonb) from authenticated;
comment on function public.invoke_internal_edge_function(text,jsonb) is 'Dispatches internal Edge Functions using Vault credentials; never callable by client roles.';

create or replace function public.handle_order_event_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.invoke_internal_edge_function('handle-order-event',jsonb_build_object('type','INSERT','table','order_events','schema','public','record',row_to_json(new)));
  return new;
end;
$$;

select cron.unschedule('pickup_reminders_push');
select cron.schedule('pickup_reminders_push','0 * * * *',$cmd$select public.invoke_internal_edge_function('handle-pickup-reminders','{}'::jsonb);$cmd$);
select cron.unschedule('weekly_summary_push');
select cron.schedule('weekly_summary_push','0 19 * * 0',$cmd$select public.invoke_internal_edge_function('handle-weekly-summary','{}'::jsonb);$cmd$);
select cron.unschedule('dispatch-nearby-offers');
select cron.schedule('dispatch-nearby-offers','0 */2 * * *',$cmd$select public.invoke_internal_edge_function('dispatch-nearby-offers','{}'::jsonb);$cmd$);

commit;