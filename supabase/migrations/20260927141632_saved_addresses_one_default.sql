-- Enforce one default address per user in the database.
--
-- WHY
--
-- `SavedAddressesService` already owns the rule: promoting an address clears
-- `is_default` on the user's other rows inside one transaction, and a PATCH
-- that would leave the book with no default is refused with 409. That is the
-- only enforcement point there was, and application logic is the wrong place to
-- leave a rule that a second writer can bypass.
--
-- The second writer is live. Mobile manages this table straight through
-- PostgREST (ADR-0002), and `dispatch-nearby-offers` reads the default address to
-- compute proximity and does `if (!userAddr) continue`. Two defaults make that
-- read undefined; no default silently stops the last-minute-deal
-- notifications, and nothing tells the user either happened.
--
-- Mobile's `setDefaultAddress` clears every default for the user and then sets
-- the target, as two separate statements. That sequence never violates this
-- index, because the clear lands first. What the index changes is the
-- concurrent case: two overlapping promotions used to leave two defaults, and
-- now the loser gets a 23505 instead of silently corrupting the book.
--
-- It does NOT close the window mobile already has between its clear and its
-- set, where the user briefly has no default. Only a transaction does that, and
-- mobile is out of scope here.
--
-- The index is partial on purpose: it only has to constrain rows that claim to
-- be the default, so it stays proportional to the number of users who have one
-- rather than to the size of the address book.
--
-- Idempotent.

begin;

-- Checked first so a dirty book produces a message naming the offending users
-- instead of the anonymous unique-violation the CREATE would raise.
do $precheck$
declare
  v_offenders text;
begin
  select string_agg(user_id::text, ', ') into v_offenders
  from (
    select user_id
    from public.saved_addresses
    where is_default
    group by user_id
    having count(*) > 1
  ) dupes;

  if v_offenders is not null then
    raise exception
      'cannot add the one-default constraint: these users already have more than one default address: %',
      v_offenders;
  end if;
end $precheck$;

create unique index if not exists idx_saved_addresses_one_default
  on public.saved_addresses (user_id)
  where is_default;

comment on index public.idx_saved_addresses_one_default is
  'At most one default address per user. Enforced here rather than only in SavedAddressesService because mobile writes this table directly through PostgREST.';

commit;