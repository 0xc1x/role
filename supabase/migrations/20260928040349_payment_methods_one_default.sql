-- Enforce one default payment method per user in the database.
--
-- WHY
--
-- `PaymentMethodsService` owns the rule on the API path: promoting a card
-- clears `is_default` on the user's other rows inside one transaction,
-- serialised with a per-user advisory lock. That is enough for the API, and it
-- is not enough for the table, because a second writer exists and is live.
--
-- Mobile manages this table straight through PostgREST (ADR-0002), in two
-- separate statements: clear every default, then set the target. Two overlapping
-- promotions leave two defaults, and nothing tells the user either happened.
--
-- Same argument as `20260927141632_saved_addresses_one_default`, and the same
-- caveat stated there applies here: the index does NOT close the window mobile
-- already has between its clear and its set, where the user briefly has no
-- default. Only a transaction does that, and mobile is out of scope here. What
-- the index changes is the concurrent case — the loser now gets a 23505 instead
-- of silently corrupting the wallet.
--
-- The predicate is partial and includes `deleted_at is null`, which the address
-- index does not need: payment methods are soft-deleted (`DELETE` sets
-- `deleted_at` and clears `active`), and a tombstone claiming to be the default
-- must not block a live one. `active` is deliberately NOT in the predicate —
-- the service clears every other row regardless of `active`, so requiring
-- `active` here would permit two `is_default` rows and contradict the very rule
-- this index is meant to make durable.
--
-- Idempotent.

begin;

-- Checked first so a dirty wallet produces a message naming the offending users
-- instead of the anonymous unique-violation the CREATE would raise.
do $precheck$
declare
  v_offenders text;
begin
  select string_agg(user_id::text, ', ') into v_offenders
  from (
    select user_id
    from public.payment_methods
    where is_default
      and deleted_at is null
    group by user_id
    having count(*) > 1
  ) dupes;

  if v_offenders is not null then
    raise exception
      'cannot add the one-default constraint: these users already have more than one default payment method: %',
      v_offenders;
  end if;
end $precheck$;

create unique index if not exists idx_payment_methods_one_default
  on public.payment_methods (user_id)
  where is_default and deleted_at is null;

comment on index public.idx_payment_methods_one_default is
  'At most one default payment method per user, ignoring soft-deleted rows. Enforced here rather than only in PaymentMethodsService because the advisory lock there cannot serialise against mobile writing the table directly through PostgREST.';

commit;