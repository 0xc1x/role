-- Backfilled gap: the order-event push trigger and its function.
--
-- RECONSTRUCTION, 2026-09-28. NOT APPLIED TO PRODUCTION. NOT BYTE-IDENTICAL TO
-- THE LEDGER ROW — see "WHAT IS NOT REPRODUCED" below, and read the note at the
-- end of this header before assuming otherwise.
--
-- WHAT THIS CLOSES
--
-- `supabase_migrations.schema_migrations` records `20260615210819` /
-- `add_order_event_push_trigger` as applied. No file for it existed in this
-- directory, so a replay of the 107 committed files never created
-- `public.handle_order_event_push()` and never attached `trg_order_event_push`.
-- Everything that touches either of them fails:
--
--   20260821213534_harden_functions_and_slides_rls.sql
--     `alter function public.handle_order_event_push() set search_path = ''`
--     `revoke execute on function public.handle_order_event_push() from anon,
--      authenticated, public`
--     Both need the function to exist. Neither is a no-op in intent: the
--     search_path pinning is a real hardening step and the EXECUTE revoke is the
--     reason a client cannot call a SECURITY DEFINER outbound-HTTP trigger
--     function by hand.
--
-- That is also the reason this slot has to be filled even though
-- 20260925163235_client_read_boundaries_vault_secrets.sql recreates the very
-- same function with the very same body. A replay is sequential. 20260925163235
-- sits on 2026-09-25; 20260821213534 sits on 2026-08-21 and dies first. The
-- chain never reaches the migration that would have fixed the missing function
-- on the way past, so the function has to be in place at its historical
-- position. Restoring the state, not rewriting the history.
--
-- WHY THE BODY IS THE FINAL ONE AND NOT THE ORIGINAL
--
-- The body below is transcribed from production, where it is the result of
-- 20260925163235 and 20260925170147: the embedded anon key was replaced by
-- `public.invoke_internal_edge_function`, which reads its credentials from
-- `vault.decrypted_secrets`. The intermediate bodies that actually ran in June
-- and August 2026 are not recoverable — `create or replace function` overwrote
-- them, and no migration in this directory preserves a copy.
--
-- The webhook envelope is byte-for-byte what the deployed `handle-order-event`
-- Edge Function requires:
--
--   type = 'INSERT', table = 'order_events', schema = 'public', record = new
--
-- The function reads `type` and `record` and silently returns { skipped: true }
-- for any other shape. A flattened { order_id, status } body would drop every
-- order notification with no error surface anywhere. The envelope is preserved
-- here for that reason, not incidentally.
--
-- `public.invoke_internal_edge_function` is created LATER, by 20260925163235.
-- That is fine and is not an oversight: a plpgsql body is not resolved for
-- referenced objects at CREATE time, so the forward reference is legal here and
-- is bound at call time. The reverse ordering would not work — a body calling a
-- function that does not exist yet, created in the same slot as the caller, is
-- the only way this chain can be honest about what it knows.
--
-- WHAT IS NOT REPRODUCED
--
-- The original file in the ledger embeds the Supabase anon JWT as a string
-- literal in the plpgsql body. It is not reproduced, and it must not be. That
-- credential was rotated out of the database by 20260925163235 and now exists
-- only as the Vault secret `supabase_anon_key`; git is not a place where a
-- rotation can be undone. `supabase/migrations/README.md` records the same
-- decision for all six absent files. What this directory gains by adding the
-- file is the SCHEMA — a function and a trigger — which is the part that
-- reproducibility depends on. The credential-bearing statement it replaced was
-- already replaced downstream.
--
-- Two further migrations from the same family,
-- 20260616005903_update_order_event_push_to_notify_func and
-- 20260622140156_fix_trigger_to_use_handle_order_event, are present in the
-- ledger and absent here. They are reconstructed as documented no-ops in their
-- own files, with the reasoning recorded there.
--
-- WHY THIS FILE MUST NOT BE APPLIED TO PRODUCTION
--
-- The function and the trigger already exist there, and the production function
-- body is the one below. Applying the file would be a no-op in effect and a lie
-- in the ledger: it would add a row for a version the server did not issue on
-- this date, and a `create trigger` against a trigger that already exists fails
-- outright. This file exists to make a replay of the directory reach the right
-- state. It is not a change to make.
--
-- ROLLBACK: `drop trigger if exists trg_order_event_push on public.order_events;`
-- and `drop function if exists public.handle_order_event_push();` removes order
-- push notifications entirely — no error, just silence. Prefer leaving the
-- trigger in place and fixing the body in a new forward migration.

begin;

create or replace function public.handle_order_event_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.invoke_internal_edge_function('handle-order-event',jsonb_build_object('type','INSERT','table','order_events','schema','public','record',row_to_json(new)));
  return new;
end;
$function$;

-- AFTER INSERT ... FOR EACH ROW. A client INSERT would be an unauthenticated
-- push primitive, which is why 20260925163235 revokes insert on order_events
-- from anon and authenticated; the database trigger is meant to be fed by the
-- API (service_role) and by the status RPC only.
create trigger trg_order_event_push
after insert on public.order_events
for each row execute function handle_order_event_push();

commit;
