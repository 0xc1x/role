import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  KNOWN_REPLAY_FAILURES,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * `public.orders` and `public.order_events` under a real login, a real role and
 * real policies — the mobile's actual data boundary.
 *
 * ─── Why this file exists, and why it is not a repeat of the pilot ───────────
 *
 * `categories.rls.db.spec.ts` proved the harness can execute a policy. This
 * file applies it to the two tables the consumer app reads on every screen, and
 * they are a different shape of problem in three ways that all change how the
 * tests have to be built.
 *
 * 1. `orders` is not behind the API. Per ADR-0002 the mobile talks to Supabase
 *    directly and RLS is the boundary; the NestJS API is a BFF for admin and
 *    landing only. So the policies below are the ONLY thing between a signed-in
 *    consumer and every order in the database. A defect here is not a bug in a
 *    service tier, it is a data breach.
 *
 * 2. The boundary is INVERTED relative to the pilot. On `categories`, Supabase's
 *    default privileges hand `anon` all seven table privileges and the POLICIES
 *    are the only thing refusing — so a denial there is a policy result and the
 *    canary test has to prove the grant is present. Here it is the other way
 *    round: `20260925155153_harden_client_write_boundaries.sql` runs
 *    `revoke all privileges on table public.orders from anon, authenticated`
 *    and grants SELECT back to `authenticated` only. The GRANT refuses first and
 *    no policy is ever consulted on a write. Every denial in the write sections
 *    below therefore has to be asserted as `permission denied for table orders`
 *    and explicitly NOT as `row-level security policy`, and the policy-set
 *    assertions carry the other half of the proof.
 *
 * 3. There is no INSERT policy, and there is not meant to be. Orders are born
 *    inside `public.reserve_offer`, a SECURITY DEFINER function that binds the
 *    caller to `auth.uid()` and writes the first `order_events` row from a
 *    trigger. "Who may read" is the boring half of this file; "how a row comes
 *    to exist without anybody holding a write grant" is the other half.
 *
 * ─── The measured posture, so a reader does not have to reconstruct it ───────
 *
 * Grants (from `information_schema` and from the live session, both asserted):
 *
 *   orders        anon: (none)          authenticated: SELECT   service_role: all 7
 *   order_events  anon: REFERENCES, TRIGGER
 *                 authenticated: SELECT, REFERENCES, TRIGGER    service_role: all 7
 *
 * Policies: three on each table, all `FOR SELECT`, all PERMISSIVE. There is no
 * INSERT, UPDATE or DELETE policy on either table, and none has been left behind
 * by a migration that dropped the matching grant — the policy list is asserted
 * as text precisely so that a future migration cannot drop a policy and leave the
 * grant, which would turn a loud refusal into a silent zero-row no-op.
 *
 * The `anon` residue on `order_events` is real and is NOT a typo in this
 * comment. `20260507193539` creates the table, so Supabase's default privileges
 * give `anon` all seven; `20260507201408` revokes SELECT; `20260925163235` revokes
 * INSERT/UPDATE/DELETE/TRUNCATE. Nothing ever revokes REFERENCES or TRIGGER, in
 * this directory or on the live project. It is pinned and measured below rather
 * than tidied away, because it is a production property too.
 *
 * ─── The composite, and what closed it ──────────────────────────────────────
 *
 * `anon` holds TRIGGER on `order_events`, and attaching a trigger requires
 * EXECUTE on the function it names. So there are two layers, on two different
 * objects, and only the second one was ever at risk: the migration whose job is
 * to revoke EXECUTE on the trigger functions is
 * `20260906125927_harden_rpc_grants.sql`, whose line 16 is
 * `revoke execute on function public.accrue_order_earnings() from public, anon, authenticated`.
 *
 * That file used NOT to apply here, and this file used to demonstrate the OPEN
 * composite as a finding about the test database rather than about production.
 * The cause was a version-ordering inversion, not a ledger hole: the file revokes
 * EXECUTE on `public.cancel_order(uuid, uuid, uuid)`, the only migration in the
 * directory creating that three-argument signature is `20260906130017`, and the
 * ledger on the live project proves `130017` ran FIRST — a `revoke ... on
 * function` with a signature that does not resolve raises 42883, the file is
 * byte-identical to the ledger, and the ledger holds a row for it, so it
 * succeeded in production and the signature existed. `APPLICATION_ORDER_OVERRIDES`
 * in `test/supabase-platform.ts` now replays that pair in the order production used.
 *
 * The composite is therefore CLOSED, and closed the same way it is in production:
 * the TRIGGER privilege is still there and still real, and the function is not
 * executable. Both halves are asserted, because the interesting property is
 * precisely that the first one alone would have been enough.
 *
 * WHAT NOT TO DO WITH IT: do not add the revoke to `PLATFORM_GRANTS_AFTER_REPLAY`
 * to make a demonstration stop. That array is documented in
 * `test/supabase-platform.ts` as having already been used exactly that way, with a
 * `grant usage on schema auth_helpers` so that the pilot's admin test would pass,
 * which made the harness describe a database nobody runs. The fix belonged in the
 * replay, and it is there now; a harness that closes a hole by granting less
 * stops being a measurement.
 *

 * ─── What the beforeAll seeds, and why each piece is not optional ───────────
 *
 * Vault: `trg_order_event_push` is `AFTER INSERT ... FOR EACH ROW` and calls
 * `invoke_internal_edge_function`, which raises `P0001 missing Vault secret
 * (supabase_url, supabase_anon_key, internal_secret)` before it dispatches
 * anything. Without the three secrets seeded, NOT ONE row can be written to
 * `order_events` and the entire read half of this file has nothing to measure.
 * They are seeded as ordinary fixture rows, not as a harness grant: the harness's
 * `vault` stub stores plaintext and its `net.http_post` returns a fake request
 * id, so nothing here asserts anything about the dispatch itself. The fail-closed
 * direction — no secret, no event — IS asserted, and that is a real property of
 * the trigger chain.
 *
 * Users: they go in through `auth.users`, never straight into `profiles`, because
 * the only producer of a profile is the `on_auth_user_created` trigger. The admin
 * fixture needs it in particular: `auth_helpers.my_role()` reads
 * `public.profiles`, so an admin that was written by hand would be a user that
 * cannot exist in production.
 *
 * Businesses and offers: `orders.offer_id` is a foreign key, so an order cannot
 * exist without one, and an offer cannot exist without a `business_location_id`.
 * The business has to be `verification_status = 'approved'` for
 * `reserve_offer` to find it, which is a condition of the RPC and not of any
 * policy here — it is stated so that the `OFFER_NOT_FOUND` branch in that
 * function is not mistaken for an RLS result.
 *
 * Events: NOT seeded. The four orders are inserted and the four `order_events`
 * rows are written by `on_order_status_change`, so the event log under test is
 * the one the database produced. That is the point: `order_events` is described as
 * an append-only log written by the trigger, and seeding it by hand would let the
 * file pass while the trigger was broken.
 */

/** Personas. The `1111…` shape matches the pilot's so the two files read alike. */
const ADMIN = '22222222-2222-2222-2222-222222222222';
/** A consumer with orders at an ACTIVE and at an INACTIVE business. */
const MEMBER = '11111111-1111-1111-1111-111111111111';
/** A second consumer, so "my orders" is provably not "all orders". */
const STRANGER = '33333333-3333-3333-3333-333333333333';
/** Owner of the active business. */
const OWNER = '44444444-4444-4444-4444-444444444444';
/** Owner of the inactive business. */
const OWNER2 = '55555555-5555-5555-5555-555555555555';

const BIZ_ACTIVE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BIZ_INACTIVE = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOC_ACTIVE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LOC_INACTIVE = 'bbbbbbbb-0000-4000-8000-000000000002';

/**
 * The four orders, keyed by the letter every assertion in this file uses.
 *
 *   A  MEMBER   @ active business      the ordinary case
 *   B  STRANGER @ active business      a second consumer at the SAME business,
 *                                      which is what makes the business owner's
 *                                      read of another person's order visible
 *   C  MEMBER   @ inactive business    does deactivating a business hide history
 *                                      from its own owner?
 *   D  STRANGER @ inactive business    the control for C
 */
const ORDER: Record<string, string> = {
  A: 'dddddddd-0000-4000-8000-000000000001',
  B: 'dddddddd-0000-4000-8000-000000000002',
  C: 'dddddddd-0000-4000-8000-000000000003',
  D: 'dddddddd-0000-4000-8000-000000000004',
};
/**
 * The same pairs, written out rather than derived.
 *
 * `Object.keys(ORDER)` returns strings, so a `[string, string][]` cast over it is
 * a lie that only shows up at runtime: destructuring a three-character string
 * yields the first character as the key and `undefined` as the id, every reverse
 * lookup misses, and every `letters()` assertion returns an empty array. It is
 * here as a literal so the two directions cannot drift and so the shape is
 * checked by the compiler instead of by a failing test.
 */
const ORDER_KEYS: readonly (readonly [string, string])[] = [
  ['A', ORDER.A],
  ['B', ORDER.B],
  ['C', ORDER.C],
  ['D', ORDER.D],
];

/** Offers, one per order, plus two reserved for the RPC reservations. */
const OFFER: Record<string, string> = {
  A: 'cccccccc-0000-4000-8000-000000000001',
  B: 'cccccccc-0000-4000-8000-000000000002',
  C: 'cccccccc-0000-4000-8000-000000000003',
  D: 'cccccccc-0000-4000-8000-000000000004',
  /**
   * Never referenced by a seeded order; only by `reserve_offer`.
   *
   * Two of them, not one, and the reason is in `reserve_offer`: it refuses a
   * second live order on the same offer for the same user with
   * `OFFER_ALREADY_RESERVED`. The reservation test and the idempotency test both
   * reserve as the same consumer, so sharing one offer would make the second one
   * fail for a reason that has nothing to do with idempotency.
   */
  RPC: 'cccccccc-0000-4000-8000-000000000005',
  RPC2: 'cccccccc-0000-4000-8000-000000000006',
};

/** The `order_events` row the trigger writes on insert. Asserted as text below. */
const TRIGGER_REASON = 'Reserva creada';

/** Value for `vault.secrets.internal_secret`. Deleted and restored by one test. */
const INTERNAL_SECRET = 'rls-orders-internal-secret';

/** A marker used by the fail-closed test, so a leaked row is identifiable. */
const BLOCKED_REASON = 'written while the dispatch secret was missing';

let ctx: SupabaseTestDb;

/**
 * postgres.js answers with a `RowList`, which is an array that also carries
 * query metadata. `toEqual` compares the metadata too and does not typecheck
 * against it. Same normalisation as the pilot: spread it.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // The three dispatch secrets. See the header: without them the push trigger
    // raises and not one event row can exist.
    for (const [name, value] of [
      ['supabase_url', 'https://dispatch-stub.invalid'],
      ['supabase_anon_key', 'rls-orders-stub-anon-key'],
      ['internal_secret', INTERNAL_SECRET],
    ] as const) {
      await tx.unsafe(
        `insert into vault.secrets (name, secret) values ('${name}', '${value}')
         on conflict (name) do update set secret = excluded.secret`,
      );
    }

    for (const [name, id] of [
      ['admin', ADMIN],
      ['member', MEMBER],
      ['stranger', STRANGER],
      ['owner', OWNER],
      ['owner2', OWNER2],
    ] as const) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${name}@rls-orders.test')
         on conflict (id) do nothing`,
      );
    }
    await tx.unsafe(
      `update public.profiles set role = 'admin' where id = '${ADMIN}'`,
    );

    /**
     * Two businesses, one active-and-approved and one neither, and the seed is
     * written the way phase 3 requires rather than the way the table reads most
     * naturally.
     *
     * `owner_id` and `verification_status` are not columns of `businesses` any
     * more: ownership lives on `business_ownership` and moderation state on
     * `business_moderation`, and the INSERT below is the minimum a client could
     * write. `trg_bootstrap_business_companions` fires AFTER INSERT and writes the
     * two companion rows itself, so the moderation row for a new business already
     * exists by the time the next statement runs and has to be UPDATED rather
     * than inserted over.
     *
     * The old comment here described a BEFORE-trigger ordering trick —
     * `trg_default_business_inactive` forcing `is_active` false and
     * `trg_sync_business_verification` deriving it back from the status — and
     * recorded that the first draft of this seed wrote `is_active = false,
     * verification_status = 'approved'` and got an ACTIVE business, which made
     * the "inactive business" persona read an active business and pass anyway.
     * That failure mode is still the reason the assertion below re-reads the row
     * instead of trusting the INSERT, so the habit is kept. The mechanism moved:
     * the derive trigger now lives on `business_moderation`, and
     * `trg_apply_business_verification_state` sets `businesses.is_active` from the
     * moderation row AFTER it changes.
     *
     * What this file depends on is unchanged and is still asserted: the inactive
     * business really is inactive, so "does deactivating a business hide its
     * history" remains the question the next test asks. The moderation invariant
     * itself — a business cannot make itself active by writing a column, because
     * there is no column left to write — is `businesses.rls.db.spec.ts`'s subject.
     */
    await tx.unsafe(`
      insert into public.businesses (id, name, type, slug)
      values ('${BIZ_ACTIVE}',   'RLS orders active',   'restaurant', 'rls-orders-active'),
             ('${BIZ_INACTIVE}', 'RLS orders inactive', 'restaurant', 'rls-orders-inactive');

      insert into public.business_ownership (business_id, owner_id)
      values ('${BIZ_ACTIVE}',   '${OWNER}'),
             ('${BIZ_INACTIVE}', '${OWNER2}');

      update public.business_moderation
         set verification_status = 'approved'
       where business_id = '${BIZ_ACTIVE}';

      insert into public.business_locations (id, business_id, name, address, latitude, longitude)
      values ('${LOC_ACTIVE}',   '${BIZ_ACTIVE}',   'Main', 'Street 1', 40.41680000, -3.70380000),
             ('${LOC_INACTIVE}', '${BIZ_INACTIVE}', 'Main', 'Street 2', 40.41700000, -3.70400000);
    `);

    for (const [key, businessId, locationId] of [
      ['A', BIZ_ACTIVE, LOC_ACTIVE],
      ['B', BIZ_ACTIVE, LOC_ACTIVE],
      ['C', BIZ_INACTIVE, LOC_INACTIVE],
      ['D', BIZ_INACTIVE, LOC_INACTIVE],
      ['RPC', BIZ_ACTIVE, LOC_ACTIVE],
      ['RPC2', BIZ_ACTIVE, LOC_ACTIVE],
    ] as const) {
      await tx.unsafe(`
        insert into public.offers
          (id, business_id, business_location_id, title, original_price, discounted_price,
           stock, initial_stock, pickup_start, pickup_end, is_active)
        values ('${OFFER[key]}', '${businessId}', '${locationId}', 'RLS offer ${key}',
                10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true);
      `);
    }

    // The four orders. `order_number` is this file's own namespace so no
    // assertion depends on whatever the ledger seeds, and so a future seed
    // migration cannot turn an exact expectation into a failure here.
    for (const [key, userId, businessId] of [
      ['A', MEMBER, BIZ_ACTIVE],
      ['B', STRANGER, BIZ_ACTIVE],
      ['C', MEMBER, BIZ_INACTIVE],
      ['D', STRANGER, BIZ_INACTIVE],
    ] as const) {
      await tx.unsafe(`
        insert into public.orders
          (id, user_id, offer_id, business_id, order_number, status, price,
           original_price, pickup_code, commission_rate, platform_fee, net_amount)
        values ('${ORDER[key]}', '${userId}', '${OFFER[key]}', '${businessId}',
                'RLS-${key}', 'confirmed', 4.00, 10.00, 'PICKUP-${key}',
                0.4000, 0.4000, 3.2000);
      `);
    }
    // No `order_events` INSERT here, on purpose — see the header.
  });
});

afterAll(async () => {
  await ctx.stop();
});

/** The four order ids a session can see through `public.orders`. */
async function visibleOrders(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ id: string }[]>(`select id from public.orders order by id`)
      .then((rows) => rows.map((r) => r.id));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

/**
 * The same question asked of the event log: which orders have a visible event.
 *
 * Not "which events" — the ids are not this file's to predict, because the
 * trigger generates them. Resolving each event to its order makes the two
 * visibility sets directly comparable, which is the whole invariant the
 * `order_events` assertions rest on.
 */
async function visibleEventOrders(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ order_id: string }[]>(
        `select order_id from public.order_events order by order_id`,
      )
      .then((rows) => [...new Set(rows.map((r) => r.order_id))].sort());
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

/**
 * The letters of this file's own orders, sorted, for readable expectations.
 *
 * A reverse lookup rather than a `Map`, because the mapping is written out as
 * literals in both directions below and a hand-rolled one cannot drift from the
 * forward direction the way a second derivation can.
 */
const LETTER_BY_ORDER_ID: Record<string, string> = Object.fromEntries(
  ORDER_KEYS.map(([key, id]) => [id, key]),
);

function letters(ids: string[]): string[] {
  return ids
    .map((id) => LETTER_BY_ORDER_ID[id])
    .filter((key): key is string => key !== undefined)
    .sort();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the impersonation is live on these two tables', () => {
  /**
   * The anti-vacuity guard, in the shape the pilot established.
   *
   * The roles are `nologin` and RLS is enabled but NOT forced, so a session that
   * forgets `set local role` runs as the table owner and bypasses every policy
   * below while every assertion in this file still passes. One cheap proof that
   * the role really is in play, on the table that matters, is what stops that.
   *
   * `anon` cannot be used for the comparison: it holds no privilege on `orders`
   * at all, so it is refused at the GRANT layer before RLS is consulted. The
   * comparison is therefore between the owner and a signed-in member, which is
   * also the comparison the product cares about.
   */
  test('a signed-in member sees strictly fewer orders than the owner', async () => {
    const asOwner = await visibleOrders(ctx.sql, 'owner', null);
    const asMember = await visibleOrders(ctx.sql, 'authenticated', MEMBER);

    expect(
      letters(asOwner),
      'the owner is missing this file’s own orders',
    ).toEqual(['A', 'B', 'C', 'D']);
    expect(letters(asMember)).toEqual(['A', 'C']);

    // RLS narrows, it never widens. A row visible to a client role and not to
    // the owner would mean a permissive policy ORed its way into existence.
    const ownerSet = new Set(asOwner);
    const leaked = asMember.filter((id) => !ownerSet.has(id));
    expect(leaked, 'a client role saw a row the owner cannot see').toEqual([]);
  });
});

describe('what the grants allow', () => {
  /**
   * `anon` holds NOTHING on `public.orders`, and the assertion is on the exact
   * empty set rather than on a few spot checks.
   *
   * The catalog view is the claim and the live session is the cross-check: a
   * grant can exist in `information_schema` and still have been revoked for
   * this role by something the view does not show, so both are asked.
   *
   * This is the INVERSE of the pilot's canary. There, `anon` held all seven
   * privileges and the policies were the only thing refusing, so the test had to
   * prove the grant was present or every denial would be vacuous. Here the
   * revoke is the boundary, and the consequence is the rule this whole file
   * follows: a refusal on this table is a GRANT refusal unless the test says
   * otherwise, and every write assertion below checks the message shape.
   */
  test('anon holds no privilege at all on orders, and authenticated holds only SELECT', async () => {
    const catalog = await ctx.sql.unsafe<
      { table_name: string; grantee: string; privilege_type: string }[]
    >(
      `select table_name, grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'orders'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type`,
    );

    expect(catalog.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
      'authenticated:SELECT',
    ]);

    // The same question asked of the session rather than the catalog, for all
    // seven privileges, for both roles.
    const live = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('anon', 'public.orders', 'select')     as sel,
               has_table_privilege('anon', 'public.orders', 'insert')     as ins,
               has_table_privilege('anon', 'public.orders', 'update')     as upd,
               has_table_privilege('anon', 'public.orders', 'delete')     as del,
               has_table_privilege('anon', 'public.orders', 'truncate')   as trunc,
               has_table_privilege('anon', 'public.orders', 'references') as refs,
               has_table_privilege('anon', 'public.orders', 'trigger')    as trg`),
    );
    expect(live[0], 'anon holds a privilege on orders it should not').toEqual({
      sel: false,
      ins: false,
      upd: false,
      del: false,
      trunc: false,
      refs: false,
      trg: false,
    });

    const liveAuth = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('authenticated', 'public.orders', 'select')   as sel,
               has_table_privilege('authenticated', 'public.orders', 'insert')   as ins,
               has_table_privilege('authenticated', 'public.orders', 'update')   as upd,
               has_table_privilege('authenticated', 'public.orders', 'delete')   as del,
               has_table_privilege('authenticated', 'public.orders', 'truncate') as trunc`),
    );
    expect(liveAuth[0]).toEqual({
      sel: true,
      ins: false,
      upd: false,
      del: false,
      trunc: false,
    });
  });

  /**
   * The `anon` residue on `order_events`, pinned exactly, including the part that
   * is uncomfortable.
   *
   * `anon` holds REFERENCES and TRIGGER, and holds nothing else. The chain is
   * worth writing out because each step is a separate migration and the residue
   * is what is left over:
   *
   *   20260507193539  creates the table  -> anon gets all seven by default
   *   20260507201408  revoke select from anon        -> six left
   *   20260925163235  revoke insert, update, delete, truncate
   *                   from anon, authenticated and from public
   *                                              -> REFERENCES and TRIGGER
   *
   * REFERENCES and TRIGGER are the two the hardening pass did not name. Both are
   * pinned here rather than tidied away, because a test that asserted "anon holds
   * nothing" would be a nicer sentence and a false one, and the next person to
   * read the ledger would have no way to tell which of the two is the lie.
   *
   * The next test is the one that says whether the residue is usable.
   */
  test('anon is left holding REFERENCES and TRIGGER on order_events, and nothing else', async () => {
    const catalog = await ctx.sql.unsafe<
      { grantee: string; privilege_type: string }[]
    >(
      `select grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'order_events'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type`,
    );

    expect(catalog.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
      'anon:REFERENCES',
      'anon:TRIGGER',
      'authenticated:REFERENCES',
      'authenticated:SELECT',
      'authenticated:TRIGGER',
    ]);

    const live = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('anon', 'public.order_events', 'select')     as sel,
               has_table_privilege('anon', 'public.order_events', 'insert')     as ins,
               has_table_privilege('anon', 'public.order_events', 'update')     as upd,
               has_table_privilege('anon', 'public.order_events', 'delete')     as del,
               has_table_privilege('anon', 'public.order_events', 'truncate')   as trunc,
               has_table_privilege('anon', 'public.order_events', 'references') as refs,
               has_table_privilege('anon', 'public.order_events', 'trigger')    as trg`),
    );
    expect(live[0]).toEqual({
      sel: false,
      ins: false,
      upd: false,
      del: false,
      trunc: false,
      refs: true,
      trg: true,
    });
  });

  /**
   * REFERENCES is inert because `anon` cannot create a table to reference from,
   * and that is a fact about the SCHEMA rather than about this table. Asserted
   * so the residue above has a stated consequence instead of being left as a
   * shrug.
   *
   * The refusal is `42501 permission denied for schema public`, which is a
   * different object from the `permission denied for table order_events` the
   * INSERT paths produce. The two are asserted apart on purpose: they are
   * different layers, and a test that accepted either would stop being evidence.
   */
  test('the REFERENCES residue is inert because anon cannot create a table', async () => {
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `create table public.rls_orders_probe_scratch (id int references public.order_events(id))`,
      ),
    );

    expect(
      denial,
      'anon created a table referencing order_events',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain('permission denied for schema public');
  });

  /**
   * RLS is enabled and NOT forced on both tables.
   *
   * `relforcerowsecurity = false` is the production setting, and it is why the
   * impersonation in `as()` is load bearing rather than ceremonial: RLS applies
   * to every role except the table owner, and the owner is the role the harness
   * connects as. Forcing it here would mean testing a database production does
   * not have.
   */
  test('RLS is enabled and not forced on both tables', async () => {
    const rows = await ctx.sql.unsafe<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(`select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('orders', 'order_events')
        order by c.relname`);

    expect(
      plainRows(rows).map((r) => [
        r.relname,
        r.relrowsecurity,
        r.relforcerowsecurity,
      ]),
    ).toEqual([
      ['order_events', true, false],
      ['orders', true, false],
    ]);
  });

  /**
   * The policy set is three SELECT policies on `orders` and three on
   * `order_events`, asserted as text from the live catalog.
   *
   * `public-read-grants.spec.ts` reads the migration to confirm the policies
   * were created. This asserts they SURVIVED, and more usefully it asserts they
   * were not WIDENED. Every write policy that ever existed on these tables is
   * accounted for in the ledger's own history and none of them is here:
   *
   *   "Users can insert own orders"              dropped 20260925155153
   *   "Users can cancel own pending orders"      dropped 20260925155153
   *   "Business can update own orders"           dropped 20260925155153
   *   "Admins can update all orders"              dropped 20260509231501, again 20260925155153
   *   "System can insert order events"            dropped 20260507201408
   *   "No direct insert on order_events"          dropped 20260529053100
   *   "Users can insert own order events"         dropped 20260925163235
   *   "Business can insert own order events"      dropped 20260925163235
   *
   * So the absence of a write policy here is a decision the ledger made four
   * times over, not an oversight. That is worth the assertion: it is the other
   * half of every write refusal in this file, and without it those refusals
   * could not be told apart from a restored grant.
   *
   * The `Admins can …` policies are `TO authenticated` and read
   * `auth_helpers.my_role()`. `20260927025753` rewrote "Business can view own
   * orders" and "Business can view own order events" to drop `businesses` from
   * the subquery, and it is one of the seven pinned replay failures, so the
   * pre-rewrite text is what runs here. The `qual` is therefore NOT asserted for
   * those two, and the reason is in the header: asserting a body that production
   * replaced would be asserting on a version nobody runs.
   */
  test('the policy set is three read-only policies on each table, unmodified', async () => {
    const rows = await ctx.sql.unsafe<
      {
        tablename: string;
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
      }[]
    >(`select tablename, policyname, cmd, permissive, roles
         from pg_policies
        where schemaname = 'public'
          and tablename in ('orders', 'order_events')
        order by tablename, policyname`);

    expect(plainRows<Record<string, unknown>>(rows)).toEqual([
      {
        tablename: 'order_events',
        policyname: 'Admins can view all order events',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'order_events',
        policyname: 'Business can view own order events',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        tablename: 'order_events',
        policyname: 'Users can view own order events',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        tablename: 'orders',
        policyname: 'Admins can view all orders',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'orders',
        policyname: 'Business can view own orders',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        tablename: 'orders',
        policyname: 'Users can view own orders',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
    ]);

    // Said a second way, so that a future migration which added a write policy
    // fails on a one-line diff rather than inside a six-element array.
    const writePolicies = await ctx.sql.unsafe<
      { tablename: string; policyname: string }[]
    >(
      `select tablename, policyname
         from pg_policies
        where schemaname = 'public'
          and tablename in ('orders', 'order_events')
          and cmd <> 'SELECT'`,
    );
    expect(
      plainRows(writePolicies).map((p) => `${p.tablename}:${p.policyname}`),
      'a non-SELECT policy exists on the orders tables',
    ).toEqual([]);
  });

  /**
   * A business owner reads another consumer's `pickup_code`, and every
   * consumer reads the platform's cut of their own order.
   *
   * Neither is a bug report; both are markers, and both are consequences of
   * `authenticated` holding TABLE-WIDE SELECT on `orders`. There is no column
   * grant anywhere in the ledger for this table, so "RLS filtered the row" and
   * "this role cannot see this column" are two different guarantees and this
   * database only has the first.
   *
   * `pickup_code` is the credential that lets someone collect the order, so
   * "the business owner of the order can read it" is almost certainly intended.
   * `commission_rate`, `platform_fee` and `net_amount` are the platform's
   * commercial terms, exposed to the consumer and to the business owner alike,
   * and that is less obviously intended.
   *
   * It is not specific to `orders`: `20260925224820_restore_businesses_table_select.sql`
   * restored table-level SELECT on `public.businesses` for the same reason —
   * PostgREST needs it to resolve relationships — and its own comment on the
   * table lists `commission_rate` and `balance` among the columns exposed to
   * `anon` as a dated, deliberate regression with a follow-up owed. That spec
   * pins the `businesses` half. This test pins the `orders` half, which no other
   * file covers.
   */
  test('a visible order exposes its pickup code and the platform money columns', async () => {
    const owner = await as(ctx.sql, 'authenticated', OWNER, (tx) =>
      tx.unsafe<
        {
          order_number: string;
          pickup_code: string;
          commission_rate: string;
          platform_fee: string;
          net_amount: string;
        }[]
      >(
        `select order_number, pickup_code, commission_rate, platform_fee, net_amount
           from public.orders
          order by order_number`,
      ),
    );

    // Order B belongs to STRANGER, not to this owner. Holding the code for a
    // consumer's order is the one thing a business panel genuinely needs.
    expect(plainRows(owner).map((r) => r.order_number)).toEqual([
      'RLS-A',
      'RLS-B',
    ]);
    expect(owner[0]?.pickup_code).toBe('PICKUP-A');
    expect(
      owner[1]?.pickup_code,
      'the owner cannot read the consumer’s code',
    ).toBe('PICKUP-B');

    // And the money columns, for the consumer's own order.
    const member = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ order_number: string; commission_rate: string }[]>(
        `select order_number, commission_rate from public.orders order by order_number`,
      ),
    );
    expect(plainRows(member)).toEqual([
      { order_number: 'RLS-A', commission_rate: '0.4000' },
      { order_number: 'RLS-C', commission_rate: '0.4000' },
    ]);

    // `anon` cannot read any of it, and the reason is the GRANT, asserted from
    // the live session rather than inferred from the row result above.
    const anonColumn = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ commission: boolean }[]>(
        `select has_column_privilege('anon', 'public.orders', 'commission_rate', 'select') as commission`,
      ),
    );
    expect(anonColumn[0]?.commission).toBe(false);
  });
});

describe('what the grants and the policies refuse together', () => {
  /**
   * `anon` reading `orders` is `42501 permission denied for table orders`, and it
   * is NOT a row-level security error.
   *
   * The negative assertion is the load-bearing half. If a future migration
   * granted `anon` something on this table, this test would still pass on the
   * code alone and would then be describing an RLS result. Asserting the
   * ABSENCE of `row-level security policy` is what keeps the claim pinned to the
   * layer that produced it — and it is the exact shape the pilot used for its
   * profile-escalation test, where the same distinction separated a live
   * escalation from a closed one.
   */
  test('anon is refused at the grant, before any policy is consulted', async () => {
    for (const [label, statement] of [
      ['select', `select id from public.orders`],
      [
        'insert',
        `insert into public.orders (user_id, offer_id, business_id, order_number, price, original_price, pickup_code) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ANON-1', 1.00, 1.00, 'ANON')`,
      ],
      ['update', `update public.orders set status = 'cancelled' returning id`],
      ['delete', `delete from public.orders returning id`],
      ['truncate', `truncate public.orders`],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
        tx.unsafe(statement),
      );

      expect(denial, `anon was able to ${label} on orders`).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table orders');
      expect(
        denial?.message,
        `the ${label} refusal came from RLS, not from the grant — the table ` +
          `grants have changed and this file no longer describes the right layer`,
      ).not.toContain('row-level security policy');
    }
  });

  /**
   * A signed-in consumer cannot write `orders` at all, on any of the three
   * paths, and every one of them is a GRANT refusal.
   *
   * The foreign keys in the INSERT are deliberately impossible: three
   * `gen_random_uuid()` values that match no `profiles`, `offers` or
   * `businesses` row. If the grant ever came back, the statement would fail on
   * `23503` instead of inserting, and the test would still report a denial —
   * which is exactly the kind of test that passes for the wrong reason. The
   * `not.toContain` line below is the guard against that, and it is why the
   * foreign keys are left broken on purpose.
   *
   * THE CONTRAST WITH THE PILOT, because it is the thing most likely to be
   * misremembered: on `categories`, an `anon` UPDATE matches ZERO ROWS and
   * returns no error, because `anon` holds the privilege and no UPDATE policy
   * exists. Here it RAISES. Same statement shape, opposite outcome, purely
   * because of the revoke. Any client that checks for an error and not for a row
   * count behaves correctly on `categories` and is not tested correctly on it.
   */
  test('an authenticated consumer cannot insert, update or delete an order, and the grant is what stops it', async () => {
    const cases: [string, string][] = [
      [
        'insert',
        `insert into public.orders (user_id, offer_id, business_id, order_number, price, original_price, pickup_code)
         values ('${MEMBER}', '${OFFER.RPC}', '${BIZ_ACTIVE}', 'RLS-MEMBER-INSERT', 4.00, 10.00, 'PICK')`,
      ],
      [
        'update',
        `update public.orders set status = 'cancelled' where id = '${ORDER.A}' returning id`,
      ],
      [
        'delete',
        `delete from public.orders where id = '${ORDER.A}' returning id`,
      ],
    ];

    for (const [label, statement] of cases) {
      const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(statement),
      );

      expect(denial, `a consumer was able to ${label} an order`).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table orders');
      // The foreign keys in the INSERT would surface as 23503 if the grant ever
      // came back, and the assertion above would still pass on the code.
      expect(denial?.message).not.toContain('violates foreign key constraint');
      expect(denial?.message).not.toContain('row-level security policy');
    }

    // And nothing changed, read as the owner — the only role that can see it.
    const rows = await ctx.sql.unsafe<{ status: string; count: number }[]>(
      `select status::text, count(*)::int as count
         from public.orders
        where id = '${ORDER.A}'
        group by status`,
    );
    expect(rows[0]).toEqual({ status: 'confirmed', count: 1 });
  });

  /**
   * `order_events` is closed to client roles on every write path, and the
   * refusal is the table grant.
   *
   * The ledger removed the write policies twice — "No direct insert on
   * order_events" in `20260507201408`, then the two "… can insert own order
   * events" policies in `20260529053100`, all three gone by `20260925163235` —
   * and revoked the privileges in the same migration. The policy set assertion
   * above is the first half; this is the second, and both are needed to say that
   * neither layer is currently doing the work alone.
   */
  test('no client role can write order_events, and the table grant is what stops it', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      for (const [label, statement] of [
        [
          'insert',
          `insert into public.order_events (order_id, status, reason) values ('${ORDER.A}', 'picked_up', 'client write')`,
        ],
        [
          'update',
          `update public.order_events set reason = 'client write' where order_id = '${ORDER.A}' returning id`,
        ],
        [
          'delete',
          `delete from public.order_events where order_id = '${ORDER.A}' returning id`,
        ],
      ] as const) {
        const denial = await deniedAs(
          ctx.sql,
          role,
          role === 'authenticated' ? MEMBER : null,
          (tx) => tx.unsafe(statement),
        );

        expect(
          denial,
          `${role} was able to ${label} an order event`,
        ).not.toBeNull();
        expect(denial?.code).toBe('42501');
        expect(denial?.message).toContain(
          'permission denied for table order_events',
        );
        expect(denial?.message).not.toContain('row-level security policy');
      }
    }
  });
});

describe('who reads what', () => {
  /**
   * The four personas, four exact sets, on the table the mobile reads on every
   * screen. This is the test that would catch a policy change, and it is scoped
   * to this file's own four orders so the ledger's own seed data cannot make it
   * fail.
   *
   * Each row isolates one question:
   *
   *   MEMBER   A, C     own orders, at an active AND an inactive business
   *   STRANGER B, D     "mine" is not "everyone's": two consumers at the same
   *                      two businesses, and the sets are disjoint
   *   OWNER    A, B     every order at their business, INCLUDING the other
   *                      consumer's — the business panel's core read
   *   OWNER2   C, D     the same, for a business that is no longer active
   *   ADMIN    A, B, C, D
   *
   * "Users can view own orders" and "Business can view own orders" are both
   * `TO public` and both PERMISSIVE, so a consumer standing in for both roles
   * would get the OR. No persona here is both, which is why the sets differ.
   */
  test('each persona reads exactly the orders the policies describe', async () => {
    const expectations: [
      label: string,
      role: 'authenticated',
      userId: string,
      expected: string[],
    ][] = [
      ['a consumer', 'authenticated', MEMBER, ['A', 'C']],
      ['a second consumer', 'authenticated', STRANGER, ['B', 'D']],
      ['the owner of the active business', 'authenticated', OWNER, ['A', 'B']],
      [
        'the owner of the inactive business',
        'authenticated',
        OWNER2,
        ['C', 'D'],
      ],
      ['an admin', 'authenticated', ADMIN, ['A', 'B', 'C', 'D']],
    ];

    for (const [label, role, userId, expected] of expectations) {
      const seen = letters(await visibleOrders(ctx.sql, role, userId));
      expect(seen, `${label} read the wrong set of orders`).toEqual(expected);
    }
  });

  /**
   * Deactivating a business does not hide its history from its own owner.
   *
   * Worth a test because it was not obvious from the policy text. "Business can
   * view own orders" resolves through a subquery on `public.businesses`, and
   * `businesses` has its own RLS — so the order policy inherits whatever
   * `businesses` decides. `Anyone can view active businesses` would have hidden
   * C and D from OWNER2. They are not hidden, because the PERMISSIVE
   * "Owners can view own businesses" is an EXISTS against
   * `public.business_ownership` with no `is_active` term, and Postgres ORs the
   * two. Phase 3 rewrote that predicate — it used to be `owner_id = auth.uid()`
   * on a column that no longer exists — and the conclusion is unchanged, which is
   * the point: the property is about ORing a permissive owner policy, not about
   * where ownership is stored.
   *
   * The member is unaffected either way: "Users can view own orders" is
   * `user_id = auth.uid()` and never mentions the business at all, so a
   * consumer keeps their history across a deactivation.
   *
   * Both facts are load bearing for the product. If a future tightening of
   * `businesses` removed the owner policy, a business that paused its account
   * would silently lose read access to every order it has ever fulfilled, and
   * nothing in the `orders` policies would have changed to warn anyone.
   */
  test('a business owner keeps its history when the business is deactivated', async () => {
    const owner2 = await as(ctx.sql, 'authenticated', OWNER2, (tx) =>
      tx.unsafe<{ order_number: string }[]>(
        `select order_number from public.orders order by order_number`,
      ),
    );
    const member = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ order_number: string }[]>(
        `select order_number from public.orders order by order_number`,
      ),
    );

    expect(plainRows(owner2).map((r) => r.order_number)).toEqual([
      'RLS-C',
      'RLS-D',
    ]);
    // The consumer's set is the same at an active and an inactive business.
    expect(plainRows(member).map((r) => r.order_number)).toEqual([
      'RLS-A',
      'RLS-C',
    ]);

    // The business really is inactive, or the test above proves nothing. Both
    // halves are read because only the second one is what the trigger chain
    // derives `is_active` from, and a future migration that changed that
    // derivation would leave the first column true and leave this assertion as
    // the only thing that noticed.
    //
    // The moderation state is read from `business_moderation` rather than from
    // `businesses`, which is where it moved in phase 3. Asking this table for
    // `verification_status` is a 42703, and a test that quietly stopped asking
    // would be a test that stopped checking anything.
    const state = await ctx.sql.unsafe<
      { slug: string; is_active: boolean; status: string }[]
    >(
      `select b.slug, b.is_active, m.verification_status::text as status
         from public.businesses b
         join public.business_moderation m on m.business_id = b.id
        where b.id = '${BIZ_INACTIVE}'`,
    );
    expect(state[0]).toEqual({
      slug: 'rls-orders-inactive',
      is_active: false,
      status: 'pending',
    });
  });

  /**
   * An admin reads every order, and it is the admin POLICY that does it.
   *
   * The two non-admin personas are held to different sets on the same table in
   * the same session role, and only `auth_helpers.my_role()` can produce that
   * difference. The admin is in "Admins can view all orders"'s `TO` list and the
   * consumers are too, so for them the expression is evaluated and comes back
   * false and the read falls through to the other two policies. Postgres does
   * not error on a false qual and does not need a true one, so a policy that
   * evaluates to false is indistinguishable, to a consumer, from a policy that
   * was never reached — which is why the "sees more" half has to be asserted
   * rather than assumed.
   *
   * This is also the live disproof of "the missing `grant usage on schema
   * auth_helpers` disarmed every admin policy" that the pilot documented: the
   * helper is still unreachable by name, and the admin policy still runs.
   */
  test('an admin reads every order, and the member reading the same table reads two', async () => {
    const asAdmin = letters(
      await visibleOrders(ctx.sql, 'authenticated', ADMIN),
    );
    const asMember = letters(
      await visibleOrders(ctx.sql, 'authenticated', MEMBER),
    );

    expect(asAdmin, 'an admin reads fewer orders than a consumer').not.toEqual(
      asMember,
    );
    expect(asAdmin).toEqual(['A', 'B', 'C', 'D']);

    // The helper is still not callable by name. Asserted here rather than
    // assumed, because this is the second table where it carries a policy and a
    // change in the answer would mean the harness had been handed a grant.
    const denial = await deniedAs(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe(`select auth_helpers.my_role()::text as role`),
    );
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for schema auth_helpers',
    );
  });

  /**
   * The event log is never wider than the order log, for any persona.
   *
   * This is the invariant the three `order_events` policies have to respect, and
   * it is structural rather than coincidental: both the consumer and the business
   * event policies resolve through a subquery on `public.orders`, and that
   * subquery runs with `orders`' OWN row security applied, as the querying user.
   * So an event is visible only if its order is.
   *
   * Stating it as an equality rather than a subset is the point. `order_events`
   * has no policy of its own that can add a row the `orders` policies would
   * hide, and if that ever stops being true the leak is into an append-only
   * audit log that no client can write to — the log would be the only place the
   * breach survived.
   */
  test('event visibility equals order visibility for every persona', async () => {
    for (const [label, role, userId] of [
      ['the owner', 'owner', null],
      ['a consumer', 'authenticated', MEMBER],
      ['a second consumer', 'authenticated', STRANGER],
      ['a business owner', 'authenticated', OWNER],
      ['the owner of the inactive business', 'authenticated', OWNER2],
      ['an admin', 'authenticated', ADMIN],
      ['service_role', 'service_role', null],
    ] as const) {
      const orders = await visibleOrders(ctx.sql, role, userId);
      const events = await visibleEventOrders(ctx.sql, role, userId);

      expect(
        letters(events),
        `${label} can read an order event for an order it cannot read`,
      ).toEqual(letters(orders));
    }
  });

  /**
   * The four event rows were written by the DATABASE, not by this file.
   *
   * `on_order_status_change` is `AFTER INSERT ... FOR EACH ROW`, SECURITY
   * DEFINER, and it writes the opening row itself. The beforeAll inserts four
   * orders and zero events, so the existence of these four rows is the evidence
   * that the trigger fired — and that `order_events` really is the "sole
   * order-event authority" `20260925155433` claims in its own header.
   *
   * `changed_by` is asserted because it is the interesting half: the trigger
   * writes `new.user_id` on INSERT, so the opening event is attributed to the
   * consumer, not to whoever happened to run the insert. A log that attributed
   * it to the writer would be a different and much less useful log.
   */
  test('the opening event of each order was written by the trigger, attributed to the consumer', async () => {
    const rows = await ctx.sql.unsafe<
      {
        order_id: string;
        status: string;
        previous_status: string | null;
        changed_by: string | null;
        reason: string;
        metadata: string;
      }[]
    >(`select order_id, status::text, previous_status::text, changed_by::text, reason, metadata::text
         from public.order_events
        order by order_id`);

    expect(plainRows(rows)).toHaveLength(4);

    const byOrder = new Map(rows.map((r) => [r.order_id, r]));
    // Keyed by LETTER, not by uuid, so it cannot drift from `ORDER_KEYS` and
    // cannot silently cover a different order than the one being asserted.
    const actorByLetter: Record<string, string> = {
      A: MEMBER,
      B: STRANGER,
      C: MEMBER,
      D: STRANGER,
    };

    for (const [key, orderId] of ORDER_KEYS) {
      const event = byOrder.get(orderId);
      expect(event, `order ${key} has no opening event`).toBeDefined();
      expect(event?.reason, `order ${key} event reason`).toBe(TRIGGER_REASON);
      expect(event?.status, `order ${key} event status`).toBe('confirmed');
      expect(
        event?.previous_status,
        `order ${key} is a first event`,
      ).toBeNull();
      expect(event?.changed_by, `order ${key} event actor`).toBe(
        actorByLetter[key],
      );
      expect(event?.metadata).toBe('{"source": "database"}');
    }
  });

  /**
   * `anon` reads `order_events.metadata` and `changed_by` if it could read the
   * row at all — it cannot, so this is about WHERE the refusal happens.
   *
   * Included because it is the one place on these two tables where a reader
   * could reasonably expect column scoping to exist and does not: `metadata` is
   * free-form jsonb and `changed_by` identifies the actor of every state change,
   * and both would be a serious disclosure on a table whose comment calls it an
   * audit log. There is no column grant in the ledger, so the ONLY thing keeping
   * them away from a client is the table grant, which is what is asserted.
   */
  test('a client read of order_events is stopped by the grant, not by any column grant', async () => {
    const columns = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ metadata: boolean; changed_by: boolean }[]>(`
        select has_column_privilege('authenticated', 'public.order_events', 'metadata',   'select') as metadata,
               has_column_privilege('authenticated', 'public.order_events', 'changed_by', 'select') as changed_by`),
    );
    // A consumer who can see an order's events sees both, table-wide.
    expect(columns[0]).toEqual({ metadata: true, changed_by: true });

    // And `anon`, who cannot see any row, is refused before the columns matter.
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`select metadata, changed_by from public.order_events`),
    );
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for table order_events',
    );
  });
});

describe('order_events is append-only, and the trigger is the only writer a client can reach', () => {
  /**
   * `anon` holds TRIGGER, and IN THIS DATABASE that is enough to attach a
   * SECURITY DEFINER trigger to the append-only log.
   *
   * ─── READ THIS BEFORE READING THE ASSERTION ────────────────────────────────
   *
   * THIS IS NOT PRODUCTION. It is the documented consequence of
   * `20260906125927_harden_rpc_grants.sql` being one of the seven pinned replay
   * failures: that migration's line 16,
   *
   *     revoke execute on function public.accrue_order_earnings() from public, anon, authenticated
   *
   * is the barrier, and one transaction per file means the whole file rolled
   * back. In production the revoke applied — the ledger is the proof, per this
   * repository's own rule — so `anon` cannot name a trigger-returning function
   * and this is not reachable.
   *
   * The demonstration is here anyway, for two reasons. First, the TRIGGER
   * privilege is not cosmetic: it really does pass the ACL check, and the only
   * thing standing between it and a write primitive is a function grant on a
   * different object. A reader who assumed the residue was inert because the
   * revocation of a function is easy to miss would be wrong in the same way a
   * reader who assumed `anon` holds nothing on `order_events` would be. Second,
   * the barrier being on another object is exactly the kind of coupling that
   * breaks silently, and the way to notice it breaking is to have the composite
   * written down while it is still closed.
   *
   * WHAT NOT TO DO: do not add the revoke to `PLATFORM_GRANTS_AFTER_REPLAY` to
   * make this test stop reporting. That array is documented in
   * `test/supabase-platform.ts` as having already been used exactly that way,
   * with a `grant usage on schema auth_helpers` that made the pilot assert a
   * privilege production does not have. A harness that closes a hole the
   * database has open stops being a measurement. The debt is the pinned failure
   * list, and the fix belongs to the replay.
   */
  test('anon holds TRIGGER on order_events, and the composite is closed by the function revoke', async () => {
    /**
     * Half one: the TRIGGER privilege is LIVE, and it is not cosmetic. It really
     * does pass the ACL check.
     *
     * Naming a function that does not return `trigger` fails with `42P17` rather
     * than `42501`, and that difference is the measurement: Postgres checks the
     * TRIGGER privilege on the TABLE before it looks at the function at all, so
     * getting as far as a complaint about the return type means the table ACL
     * passed. A `42501` here would mean the residue is cosmetic, and this file
     * should say so instead.
     *
     * `auth.uid()` is used because `anon` may execute it — the bootstrap grants
     * EXECUTE on the `auth` schema to all three client roles — so the failure
     * cannot be attributed to a missing function grant.
     */
    const wrongShape = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `create trigger rls_orders_probe_typed
           before insert on public.order_events
           for each row execute function auth.uid()`,
      ),
    );
    expect(wrongShape?.code).toBe('42P17');
    expect(wrongShape?.message).toContain('must return type trigger');
    expect(
      wrongShape?.message,
      'anon was refused the table before the function was even considered, so ' +
        'the TRIGGER privilege is not what this test assumed it was',
    ).not.toContain('permission denied');

    // Half two: with a function of the RIGHT shape — one that really is a
    // trigger — the refusal is now on the function, not the table. That is the
    // closed composite, and it is asserted as a code so a reader can tell which
    // of the two layers produced it.
    //
    // This statement used to SUCCEED here, and the test existed to demonstrate
    // that it did. It is the same composite production has, minus the hole: the
    // table privilege is unchanged, and the function grant is what closes it.
    const attach = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `create trigger rls_orders_probe_attach
           before insert on public.order_events
           for each row execute function public.accrue_order_earnings()`,
      ),
    );
    expect(
      attach,
      'anon could attach a SECURITY DEFINER trigger to the append-only event log. ' +
        'The revoke on accrue_order_earnings() is the only thing standing between ' +
        'the TRIGGER privilege and a write primitive, and it is present in this ' +
        'database — the composite is closed here exactly as it is in production.',
    ).not.toBeNull();
    expect(attach?.code).toBe('42501');

    // Nothing was left behind either way. Asserted rather than assumed, because
    // the first draft of this probe attached successfully and the `finally` was
    // the only reason the rest of the file still measured the ledger.
    const left = await ctx.sql.unsafe<{ tgname: string }[]>(
      `select t.tgname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'order_events'
          and not t.tgisinternal
        order by t.tgname`,
    );
    expect(plainRows(left).map((t) => t.tgname)).toEqual([
      'trg_order_event_push',
    ]);
  });

  /**
   * The revoke that closes the composite is present, and it is present because
   * `20260906125927` APPLIES — asserted here rather than assumed by the test
   * above.
   *
   * This file used to assert the opposite: that the file was pinned replay debt
   * failing with `42883` on `cancel_order(uuid, uuid, uuid)`, and that the
   * missing revoke was therefore a property of the test database rather than of
   * production. That is no longer true and the difference is the whole point of
   * the pair: the function-grant half of the file's `anon` denials is now a
   * PRODUCTION claim, exactly like the table-grant half.
   *
   * The ordering is not asserted as a fixture any more but as a fact about the
   * ledger, and the fact is cheap to state: `20260906130017` is applied before
   * `20260906125927` because `20260906125927` cannot succeed otherwise, and it
   * did succeed — the file is byte-identical to
   * `supabase_migrations.schema_migrations` (md5 `dac0889de56742d5b536806a0ae3fbad`)
   * and the ledger holds a row for it.
   */
  test('the function revoke applies, so the anon denials here are production claims', async () => {
    expect(
      KNOWN_REPLAY_FAILURES.find(
        (k) => k.file === '20260906125927_harden_rpc_grants.sql',
      ),
      '20260906125927 is pinned replay debt again, so every function-grant ' +
        'assertion in this file describes a database production does not have. ' +
        'The trigger composite above would be open again too.',
    ).toBeUndefined();

    // The revokes themselves, read back. Line 16 of the migration and the ones
    // above it, and this is the assertion that would fail first if a future
    // `grant ... to anon` or a blanket default privilege gave any of it back.
    const revoked = await ctx.sql.unsafe<{ name: string; anon: boolean }[]>(
      `select p.proname as name,
              has_function_privilege('anon'::name, p.oid, 'execute') as anon
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('accrue_order_earnings', 'validate_pickup_code',
                            'get_platform_stats', 'generate_payouts',
                            'notify_business_pending', 'notify_business_verification',
                            'sync_business_verification')
        order by p.proname`,
    );
    expect(plainRows(revoked)).toEqual([
      { name: 'accrue_order_earnings', anon: false },
      { name: 'generate_payouts', anon: false },
      { name: 'get_platform_stats', anon: false },
      { name: 'notify_business_pending', anon: false },
      { name: 'notify_business_verification', anon: false },
      { name: 'sync_business_verification', anon: false },
      { name: 'validate_pickup_code', anon: false },
    ]);
  });

  /**
   * The push trigger fails CLOSED: no dispatch secret, no event row.
   *
   * `trg_order_event_push` is `AFTER INSERT`, and
   * `invoke_internal_edge_function` raises `P0001` before it dispatches anything
   * when `internal_secret` is missing. The AFTER trigger's exception aborts the
   * whole INSERT, so the event is not written undispatched — the log and the
   * notification cannot drift apart.
   *
   * This is the reason the beforeAll seeds the three Vault secrets: without
   * them not one event row can exist and the whole read half of this file has
   * nothing to measure. So the direction that is easy to get wrong — "insert
   * works anyway and the notification is best effort" — is the one asserted here.
   *
   * `deniedAs` gets its own transaction, and a failed statement poisons a
   * transaction, so the secret is removed in a separate committed statement and
   * restored in a `finally`. The restore is not optional: this is a per-file
   * database and a leaked deletion would break every later test in a way that
   * has nothing to do with them.
   */
  test('an order event cannot be written undispatched: no secret, no row', async () => {
    const before = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public.order_events`,
    );

    await ctx.sql.unsafe(
      `delete from vault.secrets where name = 'internal_secret'`,
    );
    let denial: { code: string; message: string } | null = null;
    try {
      // `service_role` is the role the API writes as, and it is the one the
      // ledger permits. The trigger chain is SECURITY DEFINER either way, so the
      // vault read happens as the function owner and the writing role does not
      // change what is being tested.
      denial = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe(
          `insert into public.order_events (order_id, status, reason)
           values ('${ORDER.A}', 'picked_up', '${BLOCKED_REASON}')`,
        ),
      );
    } finally {
      await ctx.sql.unsafe(
        `insert into vault.secrets (name, secret) values ('internal_secret', '${INTERNAL_SECRET}')
         on conflict (name) do update set secret = excluded.secret`,
      );
    }

    expect(
      denial,
      'the event was written even though the dispatch secret was gone',
    ).not.toBeNull();
    expect(denial?.code).toBe('P0001');
    expect(denial?.message).toContain('missing Vault secret');

    // Belt and braces: `deniedAs` rolls back, but a trigger that raised and
    // still wrote would be a different bug and this catches it.
    const leaked = await ctx.sql.unsafe<{ reason: string }[]>(
      `select reason from public.order_events where reason = '${BLOCKED_REASON}'`,
    );
    expect(plainRows(leaked)).toEqual([]);

    const after = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public.order_events`,
    );
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  /**
   * `service_role` writes the event log, which is the API's path and the only
   * one left.
   *
   * `service_role` holds all seven privileges and `BYPASSRLS`, so nothing stops
   * it — which is correct and is not a finding, because the mobile never uses
   * it and the API connects as a client that is given it deliberately. It is
   * pinned because the claim "the database trigger is the only authority" is
   * only true for CLIENT roles, and the honest version of that sentence has to
   * say who the other writer is.
   *
   * Note what the write does NOT do: it does not create an order, and it does
   * not need to. The log is written by whoever owns the transition, and the
   * transition itself is an UPDATE on `orders` that a client cannot make.
   */
  test('service_role bypasses RLS and writes the event log directly', async () => {
    const written = await as(ctx.sql, 'service_role', null, async (tx) => {
      await tx.unsafe(
        `insert into public.order_events (order_id, status, previous_status, reason, changed_by)
         values ('${ORDER.A}', 'picked_up', 'confirmed', 'written by the API', '${ADMIN}')`,
      );
      return tx.unsafe<{ reason: string }[]>(
        `select reason from public.order_events where order_id = '${ORDER.A}' order by created_at, reason`,
      );
    });

    expect(
      plainRows(written)
        .map((r) => r.reason)
        .sort(),
    ).toEqual([TRIGGER_REASON, 'written by the API']);

    // And it sees everything the policies would otherwise divide up.
    expect(letters(await visibleOrders(ctx.sql, 'service_role', null))).toEqual(
      ['A', 'B', 'C', 'D'],
    );
  });
});

describe('orders are born inside a function, not from a table grant', () => {
  /**
   * `anon` cannot call `reserve_offer`, and the refusal is on the FUNCTION.
   *
   * A different object from every other denial in this file, and the difference
   * is the subject: the orders tables have no write grant for any client role,
   * so the question "who may create an order" is not answered by a table
   * privilege at all. It is answered here.
   *
   * ─── FIDELITY CAVEAT, and it applies to this test only ─────────────────────
   *
   * `20260906125927_harden_rpc_grants.sql` lines 3 and 4 are what revoke
   * EXECUTE from `public, anon` and grant it to `authenticated`, and that file
   * is one of the seven pinned replay failures — so the state measured here is
   * the state from BEFORE that hardening, contributed by
   * `20260507201408` (`revoke execute … reserve_offer … from anon`) and
   * `20260511203537` (`grant execute … to authenticated`).
   *
   * Both of those applied, so the measured answer coincides with the hardened
   * one and the assertion is sound. It is pinned with a cross-check below rather
   * than left to that coincidence.
   *
   * The same is NOT true of `validate_pickup_code` or `accrue_order_earnings`,
   * whose revokes live only in the failed file. See the header.
   */
  test('anon cannot reserve, and the refusal is on the function rather than the table', async () => {
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `select public.reserve_offer('${MEMBER}'::uuid, '${OFFER.RPC}'::uuid, null::uuid, 'anon-key')`,
      ),
    );

    expect(denial, 'anon reserved an offer').not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for function reserve_offer',
    );

    // The cross-check, and it is what makes the caveat above safe rather than
    // merely acknowledged: the refusal is on the function, so it cannot be a
    // grant inherited from the table.
    expect(denial?.message).not.toContain('permission denied for table orders');

    const grants = await ctx.sql.unsafe<{ anon: boolean; auth: boolean }[]>(
      `select has_function_privilege('anon'::name,          'public.reserve_offer(uuid,uuid,uuid,text)'::regprocedure, 'execute') as anon,
              has_function_privilege('authenticated'::name, 'public.reserve_offer(uuid,uuid,uuid,text)'::regprocedure, 'execute') as auth`,
    );
    expect(grants[0]).toEqual({ anon: false, auth: true });
  });

  /**
   * A consumer cannot reserve on someone else's behalf, and the function says so
   * in its return value rather than raising.
   *
   * `reserve_offer` opens with
   *
   *     if auth.uid() is not null and p_user_id is distinct from auth.uid() then
   *       return jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', …)
   *
   * The first argument is the identity, and it is taken from the JWT, not from
   * the caller. This is the whole reason the RPC is the only way in: a client
   * that can only pass a `user_id` that the function compares against
   * `auth.uid()` cannot create an order for anybody else, and there is no table
   * grant to fall back to.
   *
   * It is asserted on the return value AND on the absence of a row, because the
   * refusal is a soft one. A client that only checks for a raised error would see
   * success here — this is the mirror image of the pilot's zero-row UPDATE, and
   * the same trap in a different shape.
   */
  test('a reservation for another user is refused softly, and writes nothing', async () => {
    const result = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ result: { success: boolean; error: string } }[]>(
        `select public.reserve_offer('${STRANGER}'::uuid, '${OFFER.RPC}'::uuid, null::uuid, 'impostor-key') as result`,
      ),
    );

    expect(result[0]?.result?.success).toBe(false);
    expect(result[0]?.result?.error).toBe('UNAUTHORIZED');

    // No exception was raised — `as()` would have thrown — and no row exists.
    const rows = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public.orders where idempotency_key = 'impostor-key'`,
    );
    expect(rows[0]?.count).toBe(0);
  });

  /**
   * The full chain, end to end: one function call produces an order, the
   * database produces the event, and the consumer reads both back through RLS.
   *
   * This is the test the whole file is built around. Every other assertion says
   * a path is closed; this one says what is open, and the three links are
   * independent, which is why it is one test rather than three:
   *
   *   1. `reserve_offer` is SECURITY DEFINER and writes `orders` as the owner,
   *      so the consumer needs no table grant to have an order created for it.
   *   2. `on_order_status_change` is AFTER INSERT and SECURITY DEFINER, so the
   *      opening event is written by the database — the client wrote nothing to
   *      `order_events` and could not have.
   *   3. "Users can view own orders" then hands the consumer back exactly the
   *      order it caused, so the write path and the read path agree.
   *
   * If any link broke, this fails. A break in link 2 in particular would leave
   * the read assertions in the previous section perfectly green while the audit
   * log quietly stopped recording, which is the failure mode the trigger-authored
   * assertions are there to catch.
   */
  test('a reservation creates the order and its event, and the consumer reads both back', async () => {
    const before = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public.orders`,
    );

    const result = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<
        {
          result: {
            success: boolean;
            order_id: string;
            order_number: string;
            pickup_code: string;
            status: string;
          };
        }[]
      >(
        `select public.reserve_offer('${MEMBER}'::uuid, '${OFFER.RPC}'::uuid, null::uuid, 'rls-orders-key-1') as result`,
      ),
    );

    const reserved = result[0]?.result;
    expect(reserved?.success, 'the reservation was refused').toBe(true);
    expect(reserved?.status).toBe('pending');
    // The number and the code are generated, so the shape is the assertion and
    // the value is not: `generate_order_number()` and `generate_pickup_code()`
    // both embed the current date, and a hardcoded value would fail tomorrow.
    // The date is `YYYY` then `MMDD` — not `YYYY-MM-DD` — so the separator
    // count is part of what is being pinned.
    expect(reserved?.order_number).toMatch(/^FD-\d{4}-\d{4}-\d{3}$/);
    expect(reserved?.pickup_code).toMatch(/^[A-Z0-9]{6}$/);

    // Link 1: exactly one order, owned by the caller, priced from the offer.
    const created = await ctx.sql.unsafe<
      {
        user_id: string;
        status: string;
        price: string;
        idempotency_key: string;
      }[]
    >(
      `select user_id::text, status::text, price::text, idempotency_key
         from public.orders where id = '${reserved?.order_id}'`,
    );
    expect(created).toEqual([
      {
        user_id: MEMBER,
        status: 'pending',
        price: '4.00',
        idempotency_key: 'rls-orders-key-1',
      },
    ]);
    expect(before[0]?.count, 'the count before the reservation was wrong').toBe(
      4,
    );

    // Link 2: the event exists, and this file did not write it.
    const events = await ctx.sql.unsafe<
      { reason: string; status: string; changed_by: string | null }[]
    >(
      `select reason, status::text, changed_by::text
         from public.order_events where order_id = '${reserved?.order_id}'`,
    );
    expect(plainRows(events)).toEqual([
      { reason: TRIGGER_REASON, status: 'pending', changed_by: MEMBER },
    ]);

    // Link 3: and the consumer can read it back. This is the mobile's actual
    // read, and it is the step that would fail if the write path and the read
    // path ever disagreed about who an order belongs to.
    //
    // The three are compared as a SET, not as an ordered list. `order_number` is
    // generated by `generate_order_number()` and this file's own rows are
    // prefixed `RLS-`, so the generated one happens to sort first today; that is
    // an accident of the alphabet and pinning it would make the test fail the
    // day the prefix convention changes.
    const seen = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ order_number: string; pickup_code: string }[]>(
        `select order_number, pickup_code from public.orders order by order_number`,
      ),
    );
    expect(
      plainRows(seen)
        .map((r) => r.order_number)
        .sort(),
    ).toEqual(['RLS-A', 'RLS-C', reserved?.order_number].sort());
    // And nobody else can.
    const stranger = await as(ctx.sql, 'authenticated', STRANGER, (tx) =>
      tx.unsafe<{ order_number: string }[]>(
        `select order_number from public.orders order by order_number`,
      ),
    );
    expect(plainRows(stranger).map((r) => r.order_number)).toEqual([
      'RLS-B',
      'RLS-D',
    ]);
  });

  /**
   * The same idempotency key twice is one order, and the replay is reported
   * rather than silently performed.
   *
   * Two mechanisms, and the test needs both. The function takes
   * `pg_advisory_xact_lock` on `user:key` and then replays the stored order, and
   * `orders_user_idempotency_key_unique` is the backstop for two callers racing
   * past the lock. This asserts the observable contract — one order, one event,
   * `replayed: true` — rather than the mechanism, because the mechanism is an
   * implementation detail and the contract is what a client depends on when a
   * phone retries on a dead network.
   *
   * The single event is the part worth stating. The RPC returns the stored
   * order and returns early, so it never re-inserts, and `on_order_status_change`
   * never fires a second time. An order log that grew a duplicate "Reserva
   * creada" per network retry would be a real defect and nothing else in this
   * file would notice it.
   *
   * It reserves on `OFFER.RPC2`, not on the offer the previous test used, because
   * `reserve_offer` refuses a second live order on the same offer for the same
   * consumer with `OFFER_ALREADY_RESERVED`. Reusing it would make this test fail
   * on a duplicate check and prove nothing about idempotency.
   */
  test('replaying an idempotency key returns the same order and writes no second event', async () => {
    const first = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<
        { result: { success: boolean; order_id: string; replayed?: boolean } }[]
      >(
        `select public.reserve_offer('${MEMBER}'::uuid, '${OFFER.RPC2}'::uuid, null::uuid, 'rls-orders-key-2') as result`,
      ),
    );
    const second = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<
        { result: { success: boolean; order_id: string; replayed?: boolean } }[]
      >(
        `select public.reserve_offer('${MEMBER}'::uuid, '${OFFER.RPC2}'::uuid, null::uuid, 'rls-orders-key-2') as result`,
      ),
    );

    expect(first[0]?.result?.success).toBe(true);
    expect(second[0]?.result?.success).toBe(true);
    expect(second[0]?.result?.replayed).toBe(true);
    expect(second[0]?.result?.order_id).toBe(first[0]?.result?.order_id);

    const rows = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public.orders where idempotency_key = 'rls-orders-key-2'`,
    );
    expect(rows[0]?.count).toBe(1);

    const events = await ctx.sql.unsafe<{ count: number }[]>(
      `select count(*)::int as count
         from public.order_events where order_id = '${first[0]?.result?.order_id}'`,
    );
    expect(events[0]?.count).toBe(1);
  });
});
