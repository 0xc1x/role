import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * `public.profiles` and `public.reviews` under a real login, a real role and the
 * real policies — the escalation surface and the moderation surface.
 *
 * ─── Why these two tables together ──────────────────────────────────────────
 *
 * `orders` is the consumer's data boundary and `businesses` is the catalog's.
 * Neither of them can answer the two questions that decide whether this
 * marketplace is safe, because both are tables where the GRANT is the boundary
 * and the policy is documentation. These two are the opposite, and they are the
 * two tables where that inversion costs something concrete:
 *
 * 1. `profiles` holds the ESCALATION. `auth_helpers.my_role()` reads
 *    `public.profiles`, so `profiles.role` is the root of trust for 32 policies
 *    across 28 tables. A client that can write it owns the product.
 *
 * 2. `reviews` holds the MODERATION. It is the one table in this pair where
 *    `anon` — an unauthenticated visitor with nothing but the project's public
 *    API key — holds INSERT and DELETE, and the policies on it are the only
 *    thing standing between a script and the reputation of every business in
 *    the catalog.
 *
 * ─── What the measured posture actually is, in one place ─────────────────────
 *
 * The interesting result of this file is that the briefs one gets for these two
 * tables are both WRONG, in opposite directions, and the corrections are the
 * reason the file is worth having. Both are asserted below with the layer named.
 *
 * CORRECTION 1 — `profiles` is NOT read-only for `authenticated`.
 *
 * The table privilege is `SELECT` only: `has_table_privilege('authenticated',
 * 'public.profiles','update')` is `false`, and an UPDATE naming `role` is
 * refused with `42501 permission denied for table profiles`. But
 * `information_schema.column_privileges` holds a COLUMN-level grant:
 *
 *     grant update (avatar_url, city, email, full_name, phone) … to authenticated
 *
 * so the two `UPDATE` policies on `profiles` are NOT unreachable, and the
 * "the policies are dead code" reading is wrong. A signed-in consumer really can
 * rewrite five of its own nine columns, including `email`. The boundary is the
 * COLUMN grant, not the table grant, and `role` survives only because it is not
 * on that list. This is the same shape `businesses.rls.db.spec.ts` documents for
 * `is_active`, and on this table the privileged column is the role that decides
 * whether the caller is an admin.
 *
 * CORRECTION 3 — the `anon` write surface is decided by the CLAIM, not the role,
 * and `anon` USED TO be able to empty `reviews` outright.
 *
 * The INSERT and DELETE policies on `reviews` are both written
 * `TO public` with `auth.uid()` in them and neither of them tests whether the
 * caller is authenticated. So the predicate is satisfied by a JWT `sub`, and a
 * `sub` is not something the ROLE grants. Measured on this database:
 *
 *   - `anon` with no claim: INSERT refused, DELETE removes nothing, both SILENTLY
 *     or with a policy error respectively;
 *   - `anon` with a sub-claim: INSERT succeeds attributed to that user, and
 *     `delete … where true` removes every review that user wrote.
 *
 * The no-claim INSERT refusal is a three-valued-logic coincidence rather than a
 * design — `'1111…'::uuid = auth.uid()` evaluates to NULL, not false, and a NULL
 * `WITH CHECK` is treated as not-satisfied. See "the anon insert" below.
 *
 * And the headline used to be this: `anon` held TRUNCATE on `public.reviews`, the
 * statement succeeded, and the table was empty afterwards — including rows that
 * same session's own policies had hidden from it. RLS does not govern TRUNCATE.
 * There is no policy for it to govern and no `USING` clause is evaluated, so the
 * DELETE policy on this table was irrelevant to it: `anon` was refused deleting
 * one review at a time and could empty the table in a single statement.
 *
 * `20260928181714_revoke_client_destructive_privileges.sql` revoked TRUNCATE —
 * with TRIGGER and REFERENCES — from `anon` and `authenticated` on every RLS
 * table in `public`, and from the default privileges. The statement is now
 * `42501 permission denied for table reviews`. The finding underneath did not
 * change, only the exposure: TRUNCATE is still a privilege RLS cannot see, and
 * it is still one `security definer` RPC away from being reachable, because
 * PostgREST has no verb for it. What the migration removed is the table half of
 * that composite. The reasoning, including why "anon can delete the database"
 * would have been the wrong description, is in the migration header — and it is
 * in there because getting the severity wrong here would send the next reader
 * looking for an incident instead of reading the ledger.
 *
 * ─── The measured posture, stated so a reader does not reconstruct it ────────
 *
 *   profiles   anon: (none)   authenticated: SELECT, and column UPDATE on
 *                                    (avatar_url, city, email, full_name, phone)
 *   reviews     anon: DELETE, INSERT, SELECT
 *             authenticated: the same three, and column UPDATE on
 *                                    (business_rating, comment, product_rating, rating)
 *
 * `reviews` was six-of-seven for both roles until that migration and is three
 * now: TRUNCATE, TRIGGER and REFERENCES are gone and SELECT, INSERT and DELETE
 * remain. It is still the one table in this pair where `anon` — an
 * unauthenticated visitor with nothing but the project's public API key — holds
 * INSERT and DELETE, and the policies on it are still the only thing standing
 * between a script and the reputation of every business in the catalog. That is
 * the finding the file is built around, and the revoke changed which half of it
 * is load-bearing rather than whether it is true.
 *
 * RLS is enabled and NOT forced on both.
 *
 * ─── What the beforeAll seeds, and why each piece is not optional ───────────
 *
 * Vault: `on_order_status_change` pushes to an edge function and raises
 * `P0001 missing Vault secret` before it dispatches anything, so without the
 * three secrets NOT ONE row can be written to `orders` — and `orders` is the
 * only thing that makes "Businesses can view their order customers" measurable,
 * because that policy joins through it. The secrets are ordinary fixture rows
 * against the harness's plaintext `vault` stub; nothing here asserts anything
 * about the dispatch.
 *
 * Users: through `auth.users`, never straight into `profiles`, because the only
 * producer of a profile is the `on_auth_user_created` trigger and
 * `auth_helpers.my_role()` reads `public.profiles`. A hand-written profile is a
 * user that cannot exist in production.
 *
 * `on conflict (id) do update`, not `do nothing`, on both tables. This is not
 * tidiness: the admin's `role = 'admin'` is set by a follow-up UPDATE, and a
 * counterfactual test in this file promotes a member to admin and resets it in a
 * `finally`. With `do nothing` a leaked `role` from a previous run wins, the
 * admin fixture silently stops being an admin, and the admin assertions pass for
 * the wrong reason.
 *
 * The `profiles` seed goes through `insert … on conflict (id) do update set
 * email = excluded.email` for the same reason `email` and `role` are `NOT NULL`
 * with no default: the row has to be complete or the INSERT raises `23502`.
 */

/** Personas. The `1111…` shape matches the other three specs so they read alike. */
const ADMIN = '22222222-2222-2222-2222-222222222222';
/** A consumer, and the subject of the profile-escalation counterfactual. */
const MEMBER = '11111111-1111-1111-1111-111111111111';
/** A second consumer who bought from the same business. The cross-tenant read. */
const STRANGER = '33333333-3333-3333-3333-333333333333';
/** Owner of `BIZ_A`, the business both consumers bought from. */
const OWNER = '44444444-4444-4444-4444-444444444444';
/** Owner of `BIZ_B`, which nobody bought from. The strict negative for #8. */
const OWNER2 = '55555555-5555-5555-5555-555555555555';

const BIZ_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const BIZ_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOC_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const OFFER_A = 'cccccccc-0000-4000-8000-000000000001';
const OFFER_B = 'cccccccc-0000-4000-8000-000000000002';

const ORDER: Record<string, string> = {
  /** MEMBER at `BIZ_A`. */
  M: 'dddddddd-0000-4000-8000-000000000001',
  /** STRANGER at `BIZ_A`. The owner must see this consumer's profile. */
  S: 'dddddddd-0000-4000-8000-000000000002',
  /**
   * A SECOND order for MEMBER at `BIZ_A`, deliberately unreviewed.
   *
   * Exists for one reason: `UNIQUE (user_id, order_id)` means the happy-path
   * insert needs a (user, order) pair nobody has spent yet, and `ORDER.M` is
   * already spent by `REVIEW.M`. Seeding a spare order is cheaper and more
   * honest than having the test delete and re-insert a fixture, and it is the
   * shape production actually has — a consumer has several orders and reviews
   * one of them.
   */
  R: 'dddddddd-0000-4000-8000-000000000003',
  /**
   * A THIRD order for MEMBER, for the same reason as `R`.
   *
   * `UNIQUE (user_id, order_id)` allows exactly one review per (consumer,
   * order), so a test that needs TWO rows written by MEMBER needs two unspent
   * pairs. Giving each probe its own order is what lets both rows exist at once,
   * which is what makes the aggregate assertions below readable: a mid-test
   * delete-and-reinsert would make every count in the block a function of
   * whether the previous probe had been cleaned up yet.
   */
  Q: 'dddddddd-0000-4000-8000-000000000004',
};

const REVIEW: Record<string, string> = {
  /** MEMBER's, and the one the soft-hide tests hide. */
  M: 'eeeeeeee-0000-4000-8000-000000000001',
  /** STRANGER's, the control for the soft-hide assertions. */
  S: 'eeeeeeee-0000-4000-8000-000000000002',
};

/**
 * The 9 columns `public.profiles` carries, in order.
 *
 * Written out rather than derived so that a future column split shows up as a
 * one-line diff in the test output rather than as a count. It is also the
 * literal answer to "how many columns of a customer's profile does a business
 * owner read", and that number is asserted below against a `select *`.
 */
const PROFILE_COLUMNS: readonly string[] = [
  'id',
  'email',
  'full_name',
  'avatar_url',
  'phone',
  'role',
  'city',
  'created_at',
  'updated_at',
];

/**
 * The 5 columns `authenticated` may UPDATE on its own profile.
 *
 * Their exact membership is the whole escalation argument, so the list is a
 * fixture and not a summary: `role`, `id`, `created_at` and `updated_at` are
 * absent from it, and each absence is asserted as a separate refusal.
 */
const CLIENT_PROFILE_UPDATE_COLUMNS: readonly string[] = [
  'avatar_url',
  'city',
  'email',
  'full_name',
  'phone',
];

/**
 * The 4 columns `authenticated` may UPDATE on a review.
 *
 * The `reviews` counterpart of the list above, and the reason the
 * "Users can update own reviews" policy is NOT dead code. Note what is missing:
 * `user_id` and `is_hidden`. A client can edit the text and the numbers of its
 * own review and cannot re-attribute it or un-hide it.
 */
const CLIENT_REVIEW_UPDATE_COLUMNS: readonly string[] = [
  'business_rating',
  'comment',
  'product_rating',
  'rating',
];

/** Value the counterfactual leaves behind, so the reset can be asserted. */
const ESCALATED_ROLE = 'admin';

let ctx: SupabaseTestDb;

/**
 * postgres.js answers with a `RowList`, which is an array that also carries
 * query metadata. `toEqual` compares the metadata too and does not typecheck
 * against it. Same normalisation as the other three specs: spread it.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // See the header: without these three, `on_order_status_change` raises and
    // not one `orders` row — and therefore not one readable customer profile —
    // can exist.
    for (const [name, value] of [
      ['supabase_url', 'https://dispatch-stub.invalid'],
      ['supabase_anon_key', 'rls-profiles-reviews-stub-anon-key'],
      ['internal_secret', 'rls-profiles-reviews-internal-secret'],
    ] as const) {
      await tx.unsafe(
        `insert into vault.secrets (name, secret) values ('${name}', '${value}')
         on conflict (name) do update set secret = excluded.secret`,
      );
    }

    for (const [id, email] of [
      [ADMIN, 'admin@rls-profiles-reviews.test'],
      [MEMBER, 'member@rls-profiles-reviews.test'],
      [STRANGER, 'stranger@rls-profiles-reviews.test'],
      [OWNER, 'owner-a@rls-profiles-reviews.test'],
      [OWNER2, 'owner-b@rls-profiles-reviews.test'],
    ] as const) {
      // `do update`, not `do nothing`. See the header: the counterfactual
      // promotes a member and the reset lives in a `finally`, and a stale role
      // from a leaked earlier run would make every admin assertion pass for the
      // wrong reason.
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${email}')
         on conflict (id) do update set email = excluded.email`,
      );
    }
    await tx.unsafe(
      `update public.profiles set role = 'admin' where id = '${ADMIN}'`,
    );

    /**
     * Two businesses, two offers, FOUR orders and two reviews.
     *
     * `ORDER.R` and `ORDER.Q` are unreviewed orders for `MEMBER`; see their
     * comments.
     *
     * `business_ownership` is seeded by hand because
     * `trg_bootstrap_business_companions` writes that row only when
     * `(select auth.uid()) is not null`, and this transaction is the schema
     * owner with no JWT. Both consumers bought from `BIZ_A` and nobody bought
     * from `BIZ_B`, which is what makes #7 and #8 measurable: `OWNER` must read
     * two customer profiles, `OWNER2` must read none.
     *
     * `business_rating` and `product_rating` are given non-null values on the
     * seeded reviews, because `update_business_rating` averages
     * `business_rating` only: a review with `rating` set and the other two NULL
     * would derive `rating = 0.00` for the business, and a reader could not
     * tell a poisoned aggregate from an empty one. The moderation-forging test
     * below deliberately writes a review WITHOUT them, and asserts the derived
     * `0.00` rather than tidying it away.
     */
    await tx.unsafe(`
      insert into public.businesses (id, name, type, slug)
      values ('${BIZ_A}', 'RLS profiles A', 'restaurant', 'rls-pr-a'),
             ('${BIZ_B}', 'RLS profiles B', 'restaurant', 'rls-pr-b');

      insert into public.business_ownership (business_id, owner_id)
      values ('${BIZ_A}', '${OWNER}'),
             ('${BIZ_B}', '${OWNER2}');

      insert into public.business_locations (id, business_id, name, address, latitude, longitude)
      values ('${LOC_A}', '${BIZ_A}', 'Main', 'Street 1', 40.41680000, -3.70380000);

      insert into public.offers
        (id, business_id, business_location_id, title, original_price, discounted_price,
         stock, initial_stock, pickup_start, pickup_end, is_active)
      values ('${OFFER_A}', '${BIZ_A}', '${LOC_A}', 'RLS pr offer a', 10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true),
             ('${OFFER_B}', '${BIZ_A}', '${LOC_A}', 'RLS pr offer b', 10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true);

      insert into public.orders
        (id, user_id, offer_id, business_id, order_number, status, price,
         original_price, pickup_code, commission_rate, platform_fee, net_amount)
      values ('${ORDER.M}', '${MEMBER}',   '${OFFER_A}', '${BIZ_A}', 'RLS-PR-M', 'confirmed', 4.00, 10.00, 'PICK-M', 0.4000, 0.4000, 3.2000),
             ('${ORDER.S}', '${STRANGER}', '${OFFER_B}', '${BIZ_A}', 'RLS-PR-S', 'confirmed', 4.00, 10.00, 'PICK-S', 0.4000, 0.4000, 3.2000),
             ('${ORDER.R}', '${MEMBER}',   '${OFFER_A}', '${BIZ_A}', 'RLS-PR-R', 'confirmed', 4.00, 10.00, 'PICK-R', 0.4000, 0.4000, 3.2000),
             ('${ORDER.Q}', '${MEMBER}',   '${OFFER_A}', '${BIZ_A}', 'RLS-PR-Q', 'confirmed', 4.00, 10.00, 'PICK-Q', 0.4000, 0.4000, 3.2000);

      insert into public.reviews
        (id, user_id, business_id, order_id, rating, business_rating, product_rating, comment)
      values ('${REVIEW.M}', '${MEMBER}',   '${BIZ_A}', '${ORDER.M}', 5, 5, 5, 'RLS review mine'),
             ('${REVIEW.S}', '${STRANGER}', '${BIZ_A}', '${ORDER.S}', 4, 4, 4, 'RLS review stranger');
    `);
  });
});

afterAll(async () => {
  await ctx.stop();
});

/**
 * `profiles` ids visible to the current session.
 *
 * Scoped to this file's own five personas, so a future seed migration cannot
 * turn an exact expectation into a failure, and so a probe row a later test
 * creates stays outside every visibility assertion here.
 */
async function visibleProfiles(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ id: string }[]>(
        `select id from public.profiles
          where id in ('${ADMIN}', '${MEMBER}', '${STRANGER}', '${OWNER}', '${OWNER2}')
          order by id`,
      )
      .then((rows) => rows.map((r) => r.id));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

/** `reviews` ids visible to the current session. */
async function visibleReviews(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ id: string }[]>(`select id from public.reviews order by id`)
      .then((rows) => rows.map((r) => r.id));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

/**
 * The `role` of one profile, read as the schema owner.
 *
 * As the owner on purpose: after the counterfactual promotes a member, reading
 * the role back through a client session would be reading it through the very
 * policy under test.
 */
async function roleOf(userId: string): Promise<string> {
  const rows = await ctx.sql.unsafe<{ role: string }[]>(
    `select role::text from public.profiles where id = '${userId}'`,
  );
  return plainRows(rows)[0]?.role ?? '<missing>';
}

/** The row count of `reviews`, read as the owner so RLS cannot hide rows. */
async function reviewCount(): Promise<number> {
  const rows = await ctx.sql.unsafe<{ c: number }[]>(
    `select count(*)::int as c from public.reviews`,
  );
  return plainRows(rows)[0]?.c ?? -1;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the impersonation is live on these two tables', () => {
  /**
   * The anti-vacuity guard, in the shape the other three specs established.
   *
   * The roles are `nologin` and RLS is enabled but NOT forced, so a session that
   * forgets `set local role` runs as the table owner and bypasses every policy
   * in this file while every assertion still passes. One cheap proof on each
   * table is what stops that.
   *
   * `anon` cannot be the comparison on `profiles`: it holds no privilege there,
   * so it is refused at the GRANT layer before RLS is consulted. The comparison
   * is between the owner and a signed-in member, which is also the comparison
   * the product cares about.
   */
  test('a signed-in member sees strictly fewer rows than the owner, on both tables', async () => {
    const ownerProfiles = await visibleProfiles(ctx.sql, 'owner', null);
    const memberProfiles = await visibleProfiles(
      ctx.sql,
      'authenticated',
      MEMBER,
    );
    expect(
      ownerProfiles,
      'the owner is missing this file’s own profiles',
    ).toEqual([ADMIN, MEMBER, OWNER, OWNER2, STRANGER].sort());
    expect(memberProfiles).toEqual([MEMBER]);

    // RLS narrows, it never widens. A row visible to a client role and not to
    // the owner would mean a permissive policy ORed its way into existence.
    const ownerSet = new Set(ownerProfiles);
    expect(
      memberProfiles.filter((id) => !ownerSet.has(id)),
      'a client role saw a profiles row the owner cannot see',
    ).toEqual([]);

    // And the same on `reviews`, where the moderation policy does hide a row from
    // a third party. This is the assertion that would stop passing if a test
    // above ran as the owner instead of as a client.
    //
    // The row that gets hidden is `REVIEW.M` and the session that has to lose
    // sight of it is `STRANGER`, who is not its author. The first draft hid
    // `REVIEW.S` and asked `STRANGER` — who IS its author — and the assertion
    // failed, correctly: `Anyone can view non-hidden reviews` is
    // `is_hidden IS NOT TRUE OR user_id = auth.uid()`, so the author of a
    // hidden review still reads it. Asking the author was not a vacuity check
    // at all, it was the soft-hide behaviour asserted in the wrong place, and it
    // would have passed for a reason that had nothing to do with the session
    // being a client.
    const ownerReviews = await visibleReviews(ctx.sql, 'owner', null);
    const memberReviews = await visibleReviews(
      ctx.sql,
      'authenticated',
      MEMBER,
    );
    expect(ownerReviews).toEqual([REVIEW.M, REVIEW.S].sort());
    expect(memberReviews).toEqual([REVIEW.M, REVIEW.S].sort());

    await ctx.sql.unsafe(
      `update public.reviews
          set is_hidden = true, moderation_reason = 'harness: anti-vacuity'
        where id = '${REVIEW.M}'`,
    );
    try {
      const strangerAfterHide = await visibleReviews(
        ctx.sql,
        'authenticated',
        STRANGER,
      );
      expect(
        strangerAfterHide,
        'a hidden review is still visible to a non-author, so the RLS on ' +
          'reviews is not being applied by this session',
      ).toEqual([REVIEW.S]);
      expect(
        await visibleReviews(ctx.sql, 'anon', null),
        'a hidden review is still in the anonymous feed, so the RLS on reviews ' +
          'is not being applied by this session',
      ).toEqual([REVIEW.S]);
    } finally {
      // The reset is the ONLY statement in this finally, because a finally stops
      // at its first throw. It is an UPDATE of two columns on a primary key and
      // cannot fail on a foreign key.
      await ctx.sql.unsafe(
        `update public.reviews
            set is_hidden = false, moderation_reason = null
          where id = '${REVIEW.M}'`,
      );
    }
  });
});

describe('public.profiles: the shape of the grants', () => {
  /**
   * `anon` holds nothing on `profiles`, and the assertion is on the exact empty
   * set rather than on spot checks. Catalog and live session both, because a
   * grant can appear in `information_schema` and still have been revoked for
   * this role by something the view does not show.
   */
  test('anon holds nothing on profiles, and authenticated holds SELECT at table level', async () => {
    const catalog = await ctx.sql.unsafe<
      { table_name: string; grantee: string; privilege_type: string }[]
    >(
      `select table_name, grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'profiles'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type`,
    );

    expect(catalog.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
      'authenticated:SELECT',
    ]);

    const live = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('anon', 'public.profiles', 'select')     as sel,
               has_table_privilege('anon', 'public.profiles', 'insert')     as ins,
               has_table_privilege('anon', 'public.profiles', 'update')     as upd,
               has_table_privilege('anon', 'public.profiles', 'delete')     as del,
               has_table_privilege('anon', 'public.profiles', 'truncate')   as trunc,
               has_table_privilege('anon', 'public.profiles', 'references') as refs,
               has_table_privilege('anon', 'public.profiles', 'trigger')    as trg`),
    );
    expect(live[0], 'anon holds a privilege on profiles it should not').toEqual(
      {
        sel: false,
        ins: false,
        upd: false,
        del: false,
        trunc: false,
        refs: false,
        trg: false,
      },
    );

    const liveAuth = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('authenticated', 'public.profiles', 'SELECT')   as sel,
               has_table_privilege('authenticated', 'public.profiles', 'INSERT')   as ins,
               has_table_privilege('authenticated', 'public.profiles', 'UPDATE')   as upd,
               has_table_privilege('authenticated', 'public.profiles', 'DELETE')   as del,
               has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') as trunc`),
    );
    expect(
      liveAuth[0],
      'authenticated changed its TABLE-level profile privileges. This file ' +
        'claims the table grant is SELECT-only; if that is no longer true the ' +
        'column-grant argument below is not the whole story any more',
    ).toEqual({ sel: true, ins: false, upd: false, del: false, trunc: false });
  });

  /**
   * The correction, and the reason this file exists: `authenticated` holds a
   * COLUMN-level UPDATE on five of the nine columns.
   *
   * The table privilege above is `false` for UPDATE, and it is tempting to read
   * that as "a client cannot write its own profile". It can. `has_column_
   * privilege('authenticated','public.profiles','email','update')` is `true`,
   * and an `update … set email = …` on the caller's own row succeeds. So the two
   * `UPDATE` policies on `profiles` are live code, and the boundary is one
   * column list wide.
   *
   * Asserted three ways because each fails differently: the catalog for the
   * membership, the live session for the reachability, and the next test for
   * the write itself. A test that only asserted the catalog would pass on a
   * database where the grant is inert, and a test that only asserted the write
   * would not notice a fourth column being added.
   */
  test('authenticated holds a column-level UPDATE on exactly five profile columns, and it is reachable', async () => {
    const columns = await ctx.sql.unsafe<
      { grantee: string; privilege_type: string; column_name: string }[]
    >(
      `select grantee, privilege_type, column_name
         from information_schema.column_privileges
        where table_schema = 'public'
          and table_name   = 'profiles'
          and grantee      = 'authenticated'
          and privilege_type = 'UPDATE'
        order by column_name`,
    );

    expect(plainRows(columns).map((c) => c.column_name)).toEqual(
      [...CLIENT_PROFILE_UPDATE_COLUMNS].sort(),
    );

    // `role` is absent from that list, and `profiles.role` is what
    // `auth_helpers.my_role()` reads. That single omission is the whole reason a
    // consumer cannot promote itself, and the next two tests measure it from both
    // sides.
    expect(columns.map((c) => c.column_name)).not.toContain('role');

    // Reachable, not catalog-only. `deniedAs` returning `null` IS the success.
    const written = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.profiles
            set full_name = 'RLS renamed consumer'
          where id = auth.uid() returning full_name`,
      ),
    );
    expect(
      written,
      'the column grant is listed in the catalog but the write was refused — ' +
        'the two halves of this test have drifted apart',
    ).toBeNull();

    const after = await ctx.sql.unsafe<{ full_name: string }[]>(
      `select full_name from public.profiles where id = '${MEMBER}'`,
    );
    expect(plainRows(after)[0]?.full_name).toBe('RLS renamed consumer');

    // And `email`, which is the one in that list a business owner reads off a
    // customer's profile in the cross-tenant test below. A client rewriting it
    // is intended — it is its own address — and the point is that it is possible.
    const emailWrite = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.profiles
            set email = 'member-rewritten@rls-profiles-reviews.test'
          where id = auth.uid() returning email`,
      ),
    );
    expect(
      emailWrite,
      'a client cannot rewrite its own email, so CLIENT_PROFILE_UPDATE_COLUMNS ' +
        'is wrong or the grant changed',
    ).toBeNull();
  });

  /**
   * Every column NOT on that list is refused, and the refusal is the COLUMN
   * grant rather than the policy.
   *
   * Two of the four are load-bearing and are worth naming:
   *
   *   - `role`, which is the escalation, covered by the counterfactual below;
   *   - `id`, which is the primary key AND the foreign key target of
   *     `reviews.user_id` and `businesses` history. A client that could rewrite
   *     its own `id` would not be able to do it safely, but it is exactly the
   *     kind of column that a future migration adding "one more harmless column"
   *     to the grant list would let through.
   *
   * The message says "for table profiles" and not "for column", because that is
   * how Postgres reports a missing column privilege. Asserted as text so that
   * a change from a column-grant refusal to a policy refusal is visible: a
   * `row-level security policy` message here would mean the column grant came
   * back, and the test would then be describing a different, much worse world.
   */
  test('naming a profile column outside the grant is refused, and the message names the table', async () => {
    for (const column of ['role', 'id', 'created_at', 'updated_at']) {
      const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `update public.profiles set ${column} = ${column === 'role' ? `'admin'` : 'null'} where id = auth.uid() returning id`,
        ),
      );

      expect(
        denial,
        `a client was able to write profiles.${column}`,
      ).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table profiles');
      expect(
        denial?.message,
        `the refusal on profiles.${column} came from RLS rather than from the ` +
          `column grant, which means the grant came back and the table grant is ` +
          `no longer the whole boundary`,
      ).not.toContain('row-level security policy');
    }
  });

  /**
   * `profiles` has no INSERT and no DELETE for any client role, and the trigger
   * pair explains why the INSERT refusal is total.
   *
   * The only producer of a profile is the `on_auth_user_created` trigger on
   * `auth.users`, and `on_profile_created` / `on_profile_created_consents` fan
   * out from the row landing. A client INSERT would have to arrive without the
   * trigger having run, and the grant does not allow that shape. Both refusals
   * are asserted because "a client cannot create a profile" and "a client cannot
   * delete a profile" are the two halves of the same invariant, and the second
   * is the one with teeth: `reviews.user_id` cascades on profile delete.
   */
  test('no client role can insert or delete a profile', async () => {
    for (const [role, userId] of [
      ['anon', null],
      ['authenticated', MEMBER],
    ] as const) {
      const insert = await deniedAs(ctx.sql, role, userId, (tx) =>
        tx.unsafe(
          `insert into public.profiles (id, email) values (gen_random_uuid(), 'forged@rls-profiles-reviews.test')`,
        ),
      );
      expect(insert, `${role} inserted a profile`).not.toBeNull();
      expect(insert?.code).toBe('42501');
      expect(insert?.message).toContain('permission denied for table profiles');

      const remove = await deniedAs(ctx.sql, role, userId, (tx) =>
        tx.unsafe(
          userId === null
            ? `delete from public.profiles returning id`
            : `delete from public.profiles where id = auth.uid() returning id`,
        ),
      );
      expect(remove, `${role} deleted a profile`).not.toBeNull();
      expect(remove?.code).toBe('42501');
      expect(remove?.message).toContain('permission denied for table profiles');
    }
  });

  /**
   * RLS is enabled and NOT forced on both tables, and `profiles` carries exactly
   * the nine columns the live project carries.
   *
   * `relforcerowsecurity = false` is the production setting, and it is why the
   * impersonation in `as()` is load bearing rather than ceremonial: RLS applies
   * to every role except the table owner, and the owner is the role the harness
   * connects as. Forcing it here would mean testing a database production does
   * not have.
   *
   * The column list is asserted because the PII exposure measured later is
   * expressed in columns, and a tenth column would change the number without
   * changing any policy.
   */
  test('RLS is enabled and not forced on both tables, and profiles carries exactly nine columns', async () => {
    const flags = await ctx.sql.unsafe<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(`select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('profiles', 'reviews')
       order by c.relname`);

    expect(
      plainRows(flags).map((r) => [
        r.relname,
        r.relrowsecurity,
        r.relforcerowsecurity,
      ]),
    ).toEqual([
      ['profiles', true, false],
      ['reviews', true, false],
    ]);

    const columns = await ctx.sql.unsafe<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
        order by ordinal_position`,
    );
    expect(plainRows(columns).map((c) => c.column_name)).toEqual([
      ...PROFILE_COLUMNS,
    ]);
    expect(PROFILE_COLUMNS).toHaveLength(9);
  });

  /**
   * The five `profiles` policies, asserted as text from the live catalog, with
   * the `with_check` of each write policy asserted alongside.
   *
   * `public-read-grants.spec.ts` reads the migration to confirm the policies were
   * created. This asserts they SURVIVED and were not WIDENED, and the `qual` /
   * `with_check` columns are the load-bearing part: the whole escalation argument
   * turns on the fact that both `profiles` UPDATE policies are
   * `id = auth.uid()`, which constrains WHICH ROW and never WHICH COLUMNS. If a
   * future migration added `and role = 'user'` to the `with_check`, this diff
   * would show it, and that would be a defence in depth worth having.
   */
  test('the policy set on profiles is five policies, and the two UPDATE ones constrain the row only', async () => {
    const rows = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(`select policyname, cmd, permissive, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'profiles'
        order by policyname`);

    expect(plainRows(rows).map((r) => r.policyname)).toEqual([
      'Admins can update all profiles',
      'Admins can view all profiles',
      'Businesses can view their order customers',
      'Users can update own profile',
      'Users can view own profile',
    ]);

    const byName = new Map(plainRows(rows).map((r) => [r.policyname, r]));

    // Both UPDATE policies, asserted separately because they have different
    // shapes and only one of them has a `with_check` at all. The admin one
    // having `with_check = null` is a real property: for an `UPDATE`, a policy
    // with only a `USING` falls back to the `USING` for the post-image check, so
    // an admin's update is constrained by `my_role() = 'admin'` on both sides.
    const ownUpdate = byName.get('Users can update own profile');
    expect(ownUpdate?.cmd).toBe('UPDATE');
    expect(ownUpdate?.qual).toBe('(id = ( SELECT auth.uid() AS uid))');
    expect(ownUpdate?.with_check).toBe('(id = ( SELECT auth.uid() AS uid))');

    const adminUpdate = byName.get('Admins can update all profiles');
    expect(adminUpdate?.cmd).toBe('UPDATE');
    expect(adminUpdate?.qual).toBe(
      "(( SELECT auth_helpers.my_role() AS my_role) = 'admin'::app_role)",
    );
    expect(
      adminUpdate?.with_check,
      'the admin UPDATE policy gained a with_check. That is not wrong on its ' +
        'own — assert the new text deliberately rather than letting a diff pass.',
    ).toBeNull();

    // Said the same way once more, so a widened policy fails on a one-line diff
    // rather than inside a five-element array.
    expect(
      plainRows(rows)
        .filter((r) => r.cmd !== 'SELECT')
        .map((r) => `${r.policyname}:${r.cmd}`),
    ).toEqual([
      'Admins can update all profiles:UPDATE',
      'Users can update own profile:UPDATE',
    ]);

    // And the three SELECT policies name `auth.uid()` or `my_role()`. Two of
    // them are `TO authenticated` and the cross-tenant one resolves ownership
    // through `business_ownership`, which is what makes #7 a tenant boundary
    // rather than a business-id comparison.
    expect(byName.get('Users can view own profile')?.qual).toBe(
      '(id = ( SELECT auth.uid() AS uid))',
    );
    expect(
      byName.get('Businesses can view their order customers')?.qual,
    ).toContain('business_ownership');
    for (const name of [
      'Admins can view all profiles',
      'Businesses can view their order customers',
      'Users can view own profile',
    ]) {
      expect(byName.get(name)?.roles).toEqual(['authenticated']);
    }
  });
});

describe('the profile escalation, measured on both layers', () => {
  /**
   * The forward half: a non-admin that writes `role = 'admin'` into its own
   * profile does not become one, and the reason is the COLUMN grant.
   *
   * The policy "Users can update own profile" is
   * `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`. It constrains WHICH
   * ROW, never WHICH COLUMNS. On its own it would happily let a user rewrite its
   * own `role`. What actually stops it is that `role` is not on
   * `CLIENT_PROFILE_UPDATE_COLUMNS`.
   *
   * The negative assertion is the load-bearing half. If this ever starts failing
   * with a 0-row UPDATE or a `row-level security policy` message instead of a
   * `42501`, the column grant came back and the escalation is live — and no
   * policy-shaped test in the suite would notice, which is the same finding
   * `categories.rls.db.spec.ts` recorded for the table-level grant before the
   * column grant existed.
   */
  test('a non-admin cannot escalate by writing role into its own profile, and the column grant is what stops it', async () => {
    const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.profiles set role = '${ESCALATED_ROLE}' where id = auth.uid() returning id`,
      ),
    );

    expect(
      denial,
      'a signed-in user was able to promote its own profile',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain('permission denied for table profiles');
    expect(
      denial?.message,
      'the escalation was refused by RLS rather than by the column grant, ' +
        'which means the grant came back',
    ).not.toContain('row-level security policy');

    expect(await roleOf(MEMBER)).toBe('user');
  });

  /**
   * The counterfactual: with the column grant restored, the escalation WORKS,
   * and no policy stops it.
   *
   * ─── The question ──────────────────────────────────────────────────────────
   *
   * The test above cannot distinguish "the column grant holds the line" from
   * "the policy holds the line": with the grant in place both produce the same
   * 42501 for a client. So the grant is restored INSIDE this test, the
   * escalation is performed, the truth is asserted, and the grant is removed
   * again in a `finally`.
   *
   * ─── What it concluded, measured on this database ──────────────────────────
   *
   * The escalation reaches the root of trust, and the root of trust is real:
   * with `update (role)` granted, `update … set role = 'admin' where id =
   * auth.uid()` succeeds, `auth_helpers.my_role()` then returns `admin` inside a
   * client session, and that session reads all five profiles and writes a review
   * on `BIZ_A` through the admin policy. The escalation is not theoretical and
   * it does not stop at the profiles table.
   *
   * ─── Which layer does what, measured rather than assumed ──────────────────
   *
   * The first draft of this comment said the policies "permitted all of it",
   * and mutation testing showed that to be the wrong shape of claim: dropping
   * "Users can update own profile" while the column grant is present makes the
   * escalation return ZERO ROWS instead of succeeding. So the policy is not
   * merely permissive here — it is load-bearing, and in the opposite direction
   * from the one the word "permissive" suggests.
   *
   * The three layers, each measured:
   *
   *   grant absent, policies present   -> 42501, no row. The GRANT refuses.
   *   grant present, policy absent     -> zero rows, no error. The POLICY
   *                                       filters, and it filters ROWS: the row
   *                                       is the caller's own, so without
   *                                       "Users can update own profile" the
   *                                       only candidate is the admin policy,
   *                                       whose `my_role()` is false for a
   *                                       non-admin, and nothing matches.
   *   grant present, policy present    -> the row updates and the role becomes
   *                                       `admin`. Both layers agree the caller
   *                                       owns this row, and neither of them
   *                                   says anything about `role`.
   *
   * THAT is the finding, and it is sharper than "the policy does not stop it":
   * the two UPDATE policies on `profiles` are the ONLY thing making the
   * escalation possible, and they do not constrain the column that makes it
   * dangerous. A policy that constrains rows cannot express "but not this
   * column", and neither can a `WITH CHECK` — so the GRANT is what excludes
   * `role` today, and the policies are what would wave it through the moment it
   * were included. Both halves are asserted below, because a suite that pinned
   * only the first would miss a future migration that adds `role` to the grant
   * list while someone reads the policies as the defence.
   *
   * ─── What NOT to do with it ───────────────────────────────────────────────
   *
   * Do not add this grant to `PLATFORM_GRANTS_AFTER_REPLAY` in
   * `test/supabase-platform.ts` to make a demonstration stop. That array is
   * documented as having already been used exactly that way, with a
   * `grant usage on schema auth_helpers` that made the pilot's admin test pass
   * and the harness describe a database nobody runs. The grant here is granted
   * and revoked inside the probe, in a transaction this test controls, on a
   * per-file throwaway database, and both the grant and the PROMOTED ROLE are
   * reset and re-asserted afterwards. That is a measurement. Moving it to the
   * harness would make it a fiction.
   */
  test('with the column grant restored the escalation succeeds and the policies do not stop it', async () => {
    // The barrier, asserted first so a failure below points at its cause.
    const before = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ role_upd: boolean; email_upd: boolean }[]>(`
        select has_column_privilege('authenticated', 'public.profiles', 'role',  'update') as role_upd,
               has_column_privilege('authenticated', 'public.profiles', 'email', 'update') as email_upd`),
    );
    expect(
      plainRows(before)[0],
      'the client already holds an UPDATE grant on profiles.role, or lost the ' +
        'one on email. CLIENT_PROFILE_UPDATE_COLUMNS is the fixture for both.',
    ).toEqual({ role_upd: false, email_upd: true });

    await ctx.sql.unsafe(
      `grant update (role) on table public.profiles to authenticated`,
    );

    /**
     * Both resets live in this `finally`, and neither is allowed to throw before
     * the other has run.
     *
     * A `finally` stops at its first throw. A cleanup statement that can fail
     * must not come before the ones that restore the database's state, because a
     * failure inside the probe — which is the interesting failure — would then
     * leave the member promoted to admin and every test after this one would
     * measure the probe instead of the ledger. A measurement that corrupts the
     * measurements around it is worse than no measurement, because the failures
     * it causes look like findings.
     *
     * The role reset is first because it is the one whose absence poisons the
     * rest of the file: an admin member would make every admin-policy assertion
     * pass vacuously. The grant revoke is second. The role reset is a plain
     * UPDATE of a NOT NULL column with no trigger on UPDATE other than
     * `set_profiles_updated_at`, so it cannot fail on a foreign key, and the
     * revoke cannot fail either — both are written to succeed.
     */
    try {
      // `as()` and not `deniedAs()`: an error rethrows and fails the test with
      // the server's own message, so reaching the assertions at all IS the proof
      // that the escalation was permitted.
      const escalated = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx
          .unsafe<{ id: string; role: string }[]>(
            `update public.profiles set role = '${ESCALATED_ROLE}'
              where id = auth.uid() returning id, role::text`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(
        escalated,
        'the escalation did not go through even with the column grant ' +
          'restored. If this fails the policy DID start protecting the column, ' +
          'which is a real defence in depth and CLIENT_PROFILE_UPDATE_COLUMNS ' +
          'alone no longer describes the boundary.',
      ).toEqual([{ id: MEMBER, role: ESCALATED_ROLE }]);

      expect(await roleOf(MEMBER)).toBe(ESCALATED_ROLE);

      // The escalation is real, not cosmetic: the caller is now an admin to
      // `auth_helpers.my_role()`, and every policy that reads that helper opens.
      // Measured as a read rather than as a call, because a client session cannot
      // CALL `auth_helpers.my_role()` by name — it holds EXECUTE and no USAGE on
      // the schema, which `categories.rls.db.spec.ts` measures. The policy
      // expression is resolved once, at policy-creation time, so only the read
      // path is reachable for a client.
      const asAdmin = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx
          .unsafe<{ email: string }[]>(
            `select email from public.profiles order by email`,
          )
          .then((rows) => rows.map((r) => r.email)),
      );
      expect(
        asAdmin,
        'the escalated session still reads only its own profile, so ' +
          '"Admins can view all profiles" is not the only SELECT policy that ' +
          'opened — the admin read path is closed for a reason this file does ' +
          'not know about.',
      ).toEqual([
        'admin@rls-profiles-reviews.test',
        'member-rewritten@rls-profiles-reviews.test',
        'owner-a@rls-profiles-reviews.test',
        'owner-b@rls-profiles-reviews.test',
        'stranger@rls-profiles-reviews.test',
      ]);

      // And the write side of the admin policy, on the OTHER table. A review
      // insert is permitted by "Users can insert own reviews" too, so this one
      // is deliberately about a row the caller does not own: it is the
      // "Admins can manage all reviews" `WITH CHECK` that permits it.
      const asAdminInsert = await deniedAs(
        ctx.sql,
        'authenticated',
        MEMBER,
        (tx) =>
          tx.unsafe(
            `insert into public.reviews (user_id, business_id, rating, comment)
           values ('${ADMIN}', '${BIZ_A}', 5, 'RLS escalated insert') returning id`,
          ),
      );
      expect(
        asAdminInsert,
        'the escalated session could not write a review owned by ANOTHER user, ' +
          'so the escalation did not reach the admin policies on reviews',
      ).toBeNull();
    } finally {
      /**
       * Three resets, ordered by how much damage leaving each one behind does.
       *
       * A `finally` stops at its first throw, so the statement whose absence
       * poisons the rest of the file goes FIRST: a member left at `role = 'admin'`
       * would make every admin-policy assertion in this file pass vacuously, and
       * the next test after this one measures the probe instead of the ledger.
       * The grant revoke is second, for the same reason one clause later. The
       * row cleanup is last because a leaked review row is scoped to the
       * reviews assertions rather than to the whole file, and because it is the
       * only one that touches a table with foreign keys pointing INTO it.
       *
       * The row cleanup is here at all because `deniedAs` COMMITS on success: it
       * runs the callback inside `as()`'s transaction, and `as()` commits when
       * the callback returns. The probe above therefore wrote a real review that
       * `on_review_change` folded into `businesses.rating`, and without this
       * DELETE the TRUNCATE and count assertions further down would all be
       * measuring one row too many. The first draft of this test omitted it and
       * eleven later tests failed for that reason alone.
       *
       * The DELETE cannot raise: nothing references `public.reviews`, asserted
       * by the FK check below rather than assumed, and the two `on_review_*`
       * triggers are AFTER DELETE so the aggregate is recomputed on the way out.
       */
      await ctx.sql.unsafe(
        `update public.profiles set role = 'user' where id = '${MEMBER}'`,
      );
      await ctx.sql.unsafe(
        `revoke update (role) on table public.profiles from authenticated`,
      );
      await ctx.sql
        .unsafe(
          `delete from public.reviews where comment = 'RLS escalated insert'`,
        )
        // Swallowed, and deliberately: this is the LAST statement in the
        // finally, so a failure here cannot skip the two resets above, and the
        // assertion that follows is what makes a swallowed cleanup loud instead
        // of silent.
        .catch(() => {});
    }

    // Both are gone. Asserted, not assumed: a `revoke` that was a no-op here
    // would silently reopen the escalation for every test after this one, which
    // is the same class of bug as a fixture that is not what it says.
    expect(await roleOf(MEMBER)).toBe('user');
    const after = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ role_upd: boolean; email_upd: boolean }[]>(`
        select has_column_privilege('authenticated', 'public.profiles', 'role',  'update') as role_upd,
               has_column_privilege('authenticated', 'public.profiles', 'email', 'update') as email_upd`),
    );
    expect(
      plainRows(after)[0],
      'the probe left the column grant or the promoted role behind',
    ).toEqual({ role_upd: false, email_upd: true });

    // And the real invariant is intact after the probe: the member reads its own
    // profile and nothing else.
    expect(await visibleProfiles(ctx.sql, 'authenticated', MEMBER)).toEqual([
      MEMBER,
    ]);

    // The probe row is gone too. This is what makes the swallowed cleanup in the
    // `finally` above loud instead of silent: without it, a DELETE that raised
    // would leave a review behind and every count assertion in the rest of the
    // file would be off by one with nothing pointing at the cause.
    expect(
      await reviewCount(),
      'the escalation probe left its review row behind. `deniedAs` commits on ' +
        'success, so the insert above was real and the `finally` DELETE is the ' +
        'only thing that removes it.',
    ).toBe(2);
  });

  /**
   * The counterfactual's other half, and the half the first draft got wrong.
   *
   * Mutation testing on the test above — dropping "Users can update own profile"
   * while the column grant was in place — showed that the policy is not merely
   * permissive: without it the escalation matches ZERO ROWS. So the three
   * configurations have three DIFFERENT outcomes, and only one of them raises.
   *
   *   grant absent   -> 42501, no row      the GRANT refuses
   *   policy absent  -> zero rows, no error  the POLICY filters
   *   both present   -> the role changes    both agree the caller owns the row
   *
   * The middle one is the finding worth a test of its own, because it is the
   * configuration a reader assumes is the safe one. A reader who believed "the
   * policy protects `role`" would expect the policy's presence to be the
   * protection and its absence to be the hole. The measurement is the reverse on
   * this table: the policy is what makes the escalation REACHABLE, and neither
   * policy mentions `role` at all.
   *
   * The zero-row outcome is asserted as a COUNT, not as the absence of an error,
   * for the reason this file keeps asserting: `deniedAs` returning `null` means
   * "no error" and a matching-nothing UPDATE raises nothing.
   *
   * The policy is recreated in the `finally` before the role reset, because
   * `create policy` is the statement that must not be skipped — without it, every
   * later test in the file would run against a `profiles` table with one fewer
   * UPDATE policy, and the policy-set assertion would fail with a message
   * pointing at the ledger instead of at this probe.
   */
  test('with the column grant present and the UPDATE policy dropped, the escalation matches zero rows instead of raising', async () => {
    await ctx.sql.unsafe(
      `grant update (role) on table public.profiles to authenticated`,
    );
    await ctx.sql.unsafe(
      `drop policy if exists "Users can update own profile" on public.profiles`,
    );
    try {
      const filtered = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `update public.profiles set role = '${ESCALATED_ROLE}'
            where id = auth.uid() returning id, role::text`,
        ),
      );
      expect(
        filtered,
        'the escalation RAISED with the policy dropped. The expected outcome is ' +
          'a silent zero rows — the only remaining UPDATE policy is the admin ' +
          'one, whose my_role() is false for a non-admin, so nothing matches.',
      ).toBeNull();

      // The role is unchanged, which is the whole point: the POLICY refused, and
      // it refused by not matching rather than by raising.
      expect(
        await roleOf(MEMBER),
        'the role changed even though no row was returned. A zero-row UPDATE ' +
          'cannot change a row, so this would mean the role was set by something ' +
          'other than the statement above.',
      ).toBe('user');

      // So the two refusals are not the same refusal, and the distinction is the
      // one this whole file is about: one is a GRANT and one is a POLICY, and a
      // test that accepted either would stop being evidence. Measured by
      // removing the GRANT while the policy is still dropped: what refuses the
      // statement is the privilege, and the message names the table rather than
      // the policy.
      await ctx.sql.unsafe(
        `revoke update (role) on table public.profiles from authenticated`,
      );
      const withoutGrant = await deniedAs(
        ctx.sql,
        'authenticated',
        MEMBER,
        (tx) =>
          tx.unsafe(`update public.profiles set role = '${ESCALATED_ROLE}'`),
      );
      expect(
        withoutGrant,
        'removing the column grant did NOT raise. So the refusal in the arm ' +
          'above was not the grant after all, and the three-layer claim in the ' +
          'header is wrong about which layer refuses what.',
      ).not.toBeNull();
      expect(withoutGrant?.code).toBe('42501');
      expect(withoutGrant?.message).toContain(
        'permission denied for table profiles',
      );
      expect(withoutGrant?.message).not.toContain('row-level security policy');
      expect(await roleOf(MEMBER)).toBe('user');
    } finally {
      // The policy first: it is the reset whose absence poisons the FILE rather
      // than one test, because the policy-set assertion upstream reads the
      // catalog. Then the role, then the grant.
      await ctx.sql.unsafe(`
        create policy "Users can update own profile" on public.profiles
          for update
          using (id = (select auth.uid()))
          with check (id = (select auth.uid()))
      `);
      await ctx.sql.unsafe(
        `update public.profiles set role = 'user' where id = '${MEMBER}'`,
      );
      await ctx.sql.unsafe(
        `revoke update (role) on table public.profiles from authenticated`,
      );
    }

    // The policy is back, with its original text. Asserted on the catalog rather
    // than on `pg_get_expr`, because the exact rendering is Postgres's business
    // and the name, command and row scope are the contract.
    const restored = await ctx.sql.unsafe<
      { policyname: string; cmd: string; qual: string; with_check: string }[]
    >(
      `select policyname, cmd, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'profiles'
          and policyname = 'Users can update own profile'`,
    );
    expect(plainRows(restored)).toEqual([
      {
        policyname: 'Users can update own profile',
        cmd: 'UPDATE',
        qual: '(id = ( SELECT auth.uid() AS uid))',
        with_check: '(id = ( SELECT auth.uid() AS uid))',
      },
    ]);

    expect(await roleOf(MEMBER)).toBe('user');
    const grant = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ role_upd: boolean }[]>(
        `select has_column_privilege('authenticated', 'public.profiles', 'role', 'update') as role_upd`,
      ),
    );
    expect(plainRows(grant)[0]?.role_upd).toBe(false);
  });
});

describe('the cross-tenant profile read', () => {
  /**
   * #7, measured: a business owner reads ALL NINE columns of every consumer
   * that ever bought from its business, and `email` is one of them.
   *
   * "Businesses can view their order customers" is `TO authenticated`,
   * `FOR SELECT`, and its `qual` is
   *
   *     EXISTS (SELECT 1 FROM orders o
   *             JOIN business_ownership bo ON bo.business_id = o.business_id
   *             WHERE o.user_id = profiles.id AND bo.owner_id = auth.uid())
   *
   * There is no column list anywhere in it and there is no column grant on this
   * table: `authenticated` holds table-level `SELECT`, so "RLS filtered the
   * row" and "this role cannot see this column" are two different guarantees and
   * this database only has the first.
   *
   * The number is asserted as a measured exposure rather than described as one.
   * On this fixture the owner of `BIZ_A` sees two customer profiles plus its
   * own — three rows, nine columns each, and `email` and `phone` are among
   * them. `email` is a real address and it is the one a signup wrote, not a
   * pseudonym; `phone` is a contact number. The owner of a business with one
   * sale has a customer's email address, and the ledger has no column grant that
   * says it should not.
   *
   * Not a bug report, a marker. A business panel genuinely needs to know who a
   * customer is, and the read is scoped to people who transacted with that
   * business and no one else — the next test is what makes that true. But the
   * surface is the whole 9-column row, and the fix for "the owner should only
   * see name and city" is a column grant or a view, not a policy, because a
   * policy cannot restrict columns either. Exactly the shape of the
   * `commission_rate` exposure `orders.rls.db.spec.ts` pins for the money columns
   * on `orders`.
   */
  test('a business owner reads all nine columns of every customer that bought from it, email included', async () => {
    const owner = await as(ctx.sql, 'authenticated', OWNER, (tx) =>
      tx
        .unsafe<Record<string, unknown>[]>(
          `select * from public.profiles
            where id in ('${ADMIN}', '${MEMBER}', '${STRANGER}', '${OWNER}', '${OWNER2}')
            order by id`,
        )
        .then((rows) => plainRows(rows)),
    );

    // Three rows: its own profile, and the two consumers that bought from it.
    expect(
      owner.map((r) => r.id),
      'the owner does not read exactly its own profile plus its two customers. ' +
        'STRANGER bought from BIZ_A and so must be visible; ADMIN and OWNER2 did ' +
        'not and must not be.',
    ).toEqual([MEMBER, OWNER, STRANGER].sort());

    // THE MEASUREMENT. Every column, on a row that belongs to somebody else.
    const customer = owner.find((r) => r.id === STRANGER);
    expect(
      customer,
      'STRANGER is not in the owner’s read, so the column count below would be ' +
        'asserted against the wrong row',
    ).toBeDefined();
    expect(
      Object.keys(customer as Record<string, unknown>).sort(),
      'the owner does not read the whole row, or the table grew a column. ' +
        'A tenth column here is a tenth piece of PII reaching every business ' +
        'with a sale.',
    ).toEqual([...PROFILE_COLUMNS].sort());
    expect(PROFILE_COLUMNS).toHaveLength(9);

    // The two columns that make this a PII finding rather than a directory
    // listing, asserted by value and not only by presence.
    expect(customer?.email).toBe('stranger@rls-profiles-reviews.test');
    expect(
      customer?.phone,
      'the owner read the customer’s phone number. This test is what pins the ' +
        'exposure, so a future column grant that redacts it fails here — which ' +
        'is the desired direction, and means the fixture above is updated too.',
    ).toBeNull();

    // And the owner's own row comes back through the same table-level SELECT,
    // which is why the row count is 3 and not 2.
    expect(owner.find((r) => r.id === OWNER)?.email).toBe(
      'owner-a@rls-profiles-reviews.test',
    );
  });

  /**
   * #8, the strict contrast: the same three refusals, three ways.
   *
   * Without this the previous test is a measurement of nothing in particular —
   * "the owner reads 3 profiles" is equally consistent with a policy that grants
   * a read of everything and a policy that grants a read of the right things.
   * Each arm below fails for a different reason and all three are asserted:
   *
   *   OWNER2  — owns a business and read NOBODY. It fails on the `EXISTS`: no
   *              order names `BIZ_B`. The tenant boundary.
   *   STRANGER — bought from `BIZ_A` and is not an owner, so it reads only
   *              itself. It fails on `bo.owner_id = auth.uid()`: having bought
   *              is not the same as owning, and that is the half of the policy
   *              that is easy to get wrong.
   *   `anon`   — refused at the GRANT with `42501 permission denied for table
   *              profiles`, before any policy is consulted. Not a zero-row
   *              result and not an RLS error, and the negative assertion on
   *              `row-level security policy` is what keeps the claim pinned to
   *              the layer that produced it.
   */
  test('a business reads nobody it did not sell to, a consumer is not an owner, and anon is refused at the grant', async () => {
    // Owns a business, sold nothing: sees itself and nothing else.
    expect(await visibleProfiles(ctx.sql, 'authenticated', OWNER2)).toEqual([
      OWNER2,
    ]);

    // Bought from a business, owns none: the read is not transitive.
    expect(await visibleProfiles(ctx.sql, 'authenticated', STRANGER)).toEqual([
      STRANGER,
    ]);

    // And the owner's own read is strictly larger than both, which is what
    // makes the two results above a boundary rather than an accident of the
    // fixture.
    expect(
      (await visibleProfiles(ctx.sql, 'authenticated', OWNER)).length,
    ).toBeGreaterThan(1);

    // `anon`, at the grant. The message shape is the assertion.
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`select email from public.profiles`),
    );
    expect(
      denial,
      'anon read the profiles table. If this started succeeding, the profiles ' +
        'grants have changed and this file no longer describes the right layer.',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain('permission denied for table profiles');
    expect(
      denial?.message,
      'the anon refusal came from RLS rather than from the grant',
    ).not.toContain('row-level security policy');
  });

  /**
   * The admin read is real, and it is a read of the same nine columns.
   *
   * Asserted because "Admins can view all profiles" is `TO authenticated` and
   * reads `auth_helpers.my_role()`, which a client session CANNOT call by name
   * (it holds EXECUTE and no USAGE on the schema). So the only way to know
   * whether that policy is reachable is to have a profile whose `role` really is
   * `admin` and read the table — which is what this test does, and it is the
   * reason the admin fixture is written through `auth.users` and promoted by the
   * database rather than hand-inserted as a profile row.
   */
  test('an admin reads every profile, and a member reading the same table reads fewer', async () => {
    const asAdmin = await as(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx
        .unsafe<{ email: string }[]>(
          `select email from public.profiles order by email`,
        )
        .then((rows) => rows.map((r) => r.email)),
    );
    const asMember = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx
        .unsafe<{ email: string }[]>(
          `select email from public.profiles order by email`,
        )
        .then((rows) => rows.map((r) => r.email)),
    );

    expect(asAdmin).toHaveLength(5);
    expect(asMember).toEqual(['member-rewritten@rls-profiles-reviews.test']);

    // RLS narrows. The owner of the schema sees 5 too, and an admin must never
    // see a row the owner cannot.
    const asOwner = await visibleProfiles(ctx.sql, 'owner', null);
    expect(asOwner).toHaveLength(5);
  });
});

describe('public.reviews: the grants anon actually holds', () => {
  /**
   * The privilege table for `reviews`, asserted from the catalog and again from
   * the live session, because it is the premise of every write assertion in this
   * file.
   *
   * It used to read `anon and authenticated hold six of seven table privileges
   * on reviews, and TRUNCATE is one of them`, and it held that from the default
   * privileges with UPDATE the single exception — a real write surface on a table
   * whose policies are written as if nobody could write it.
   *
   * `20260928181714_revoke_client_destructive_privileges.sql` took the three
   * back: TRUNCATE, TRIGGER and REFERENCES are gone for `anon` and
   * `authenticated` on every RLS table in `public`, and gone from the default
   * privileges too. What remains on `reviews` is DELETE, INSERT and SELECT —
   * which is the interesting shape, and a different one from "fully granted" and
   * from "fully revoked". Every row the anonymous session can see is still
   * filtered by the policies, and `anon` still cannot write a row its own claim
   * does not attribute to it.
   *
   * Asserted as the exact list rather than as a count so a future migration that
   * grants one of the three back fails on a one-line diff. UPDATE is still absent
   * for both roles — the column-level UPDATE on four columns is asserted
   * separately below and is unaffected by this one.
   */
  test('anon and authenticated hold three table privileges on reviews, and none of the three RLS cannot govern', async () => {
    const catalog = await ctx.sql.unsafe<
      { grantee: string; privilege_type: string }[]
    >(
      `select grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'reviews'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type`,
    );

    expect(catalog.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
      'anon:DELETE',
      'anon:INSERT',
      'anon:SELECT',
      'authenticated:DELETE',
      'authenticated:INSERT',
      'authenticated:SELECT',
    ]);

    for (const role of ['anon', 'authenticated'] as const) {
      const live = await as(
        ctx.sql,
        role,
        role === 'anon' ? null : MEMBER,
        (tx) =>
          tx.unsafe<Record<string, boolean>[]>(`
          select has_table_privilege('${role}', 'public.reviews', 'SELECT')     as sel,
                 has_table_privilege('${role}', 'public.reviews', 'INSERT')     as ins,
                 has_table_privilege('${role}', 'public.reviews', 'UPDATE')     as upd,
                 has_table_privilege('${role}', 'public.reviews', 'DELETE')     as del,
                 has_table_privilege('${role}', 'public.reviews', 'TRUNCATE')   as trunc,
                 has_table_privilege('${role}', 'public.reviews', 'REFERENCES') as refs,
                 has_table_privilege('${role}', 'public.reviews', 'TRIGGER')    as trg`),
      );
      expect(live[0], `${role} privileges on reviews changed`).toEqual({
        sel: true,
        ins: true,
        upd: false,
        del: true,
        trunc: false,
        refs: false,
        trg: false,
      });
    }
  });

  /**
   * CORRECTION 1, inverted: `anon` can NO LONGER EMPTY `reviews`, because it no
   * longer holds TRUNCATE.
   *
   * ─── WHAT THIS TEST CONCLUDED BEFORE ───────────────────────────────────────
   *
   * It was the headline finding of this file and it was measured, not argued. The
   * name was `anon can TRUNCATE reviews, and it empties the table RLS was hiding
   * rows from`, `anon` held TRUNCATE, the statement succeeded, and every row
   * went — including a row the same anonymous session could SEE. RLS does not
   * govern TRUNCATE: there is no policy for it to govern and no `USING` clause
   * evaluated, so the policy that filters rows on this table is not consulted at
   * all. `cascade` and `restart identity cascade` worked too.
   *
   * ─── WHAT IT CONCLUDES NOW, AND WHY IT IS STILL WORTH KEEPING ──────────────
   *
   * The privilege is gone, so the same statement is `42501 permission denied for
   * table reviews`. This is the inverse written deliberately rather than the old
   * test deleted: same write, same role, same database, one migration between
   * them — which is what makes the before/after attributable to the migration and
   * not to a schema change nobody noticed.
   *
   * The finding underneath it did not change, only the exposure. TRUNCATE is
   * still a privilege RLS cannot see, and it is still one `security definer` RPC
   * away from being reachable through PostgREST, which has no verb for it. What
   * this migration removed is the table half of that composite, so the function
   * half can no longer stand alone. The full argument, including why "anon can
   * delete the database" would have been the wrong description, is in the
   * migration header.
   *
   * The count assertion is kept in inverted form for the same reason the old one
   * had it: a refusal alone cannot tell "the privilege is gone" from "the
   * statement was a no-op against an empty table". The seeded rows are re-read
   * before and after, so a table that was emptied by something else still fails
   * here.
   */
  test('anon cannot TRUNCATE reviews: the statement is refused and the table is untouched', async () => {
    const before = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ c: number }[]>(
        `select count(*)::int as c from public.reviews`,
      ),
    );
    // The same precondition the previous version of this test asserted, for the
    // same reason: the count going to zero has to be a change and not a
    // coincidence.
    expect(
      plainRows(before)[0]?.c,
      'the anonymous session should see both seeded reviews before the attempt',
    ).toBe(2);

    const truncated = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`truncate public.reviews`),
    );
    expect(
      truncated,
      'anon TRUNCATEd reviews with no error. Nothing on this table would have ' +
        'refused it: RLS does not evaluate a USING clause for TRUNCATE, so the ' +
        'DELETE policy below is irrelevant to that statement. The privilege is ' +
        'back.',
    ).not.toBeNull();
    expect(truncated?.code).toBe('42501');
    expect(truncated?.message).toContain('permission denied for table reviews');

    // The count is the assertion. `42501` alone says the statement was refused;
    // it does not say the table still has its rows.
    expect(
      await reviewCount(),
      'anon was refused TRUNCATE and the table is empty anyway — so the ' +
        'refusal is being produced by something other than the grant and this ' +
        'test is asserting the wrong layer',
    ).toBe(2);

    // `cascade` is a separate statement because it is a separate capability, and
    // it is refused the same way. Before the migration both of these SUCCEEDED.
    // The old expectation was `null` with a count of zero; the new one names the
    // refusal, and the count assertion is what makes it a measurement.
    const cascaded = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`truncate public.reviews cascade`),
    );
    expect(
      cascaded,
      'anon was not refused TRUNCATE … CASCADE, so the revoke covered the bare ' +
        'statement but not the cascade form',
    ).not.toBeNull();
    expect(cascaded?.code).toBe('42501');
    expect(await reviewCount()).toBe(2);

    // And the same for `authenticated`, which held the same TRUNCATE. A
    // signed-in consumer is not a special case here; it was the same hole with a
    // worse blast radius, because the consumer also has a session.
    const authTruncated = await deniedAs(
      ctx.sql,
      'authenticated',
      MEMBER,
      (tx) =>
        tx.unsafe(`truncate table public.reviews restart identity cascade`),
    );
    expect(
      authTruncated,
      'a consumer was not refused TRUNCATE on reviews',
    ).not.toBeNull();
    expect(authTruncated?.code).toBe('42501');
    expect(await reviewCount()).toBe(2);

    // The fixture is intact, both rows and neither hidden. Asserted because a
    // refusal that emptied the table would leave every later visibility assertion
    // in this file passing for the wrong reason — and because the previous
    // version of this test needed a `finally` here to rebuild the two rows it
    // destroyed. There is no cleanup left to do, and that is the point.
    const restored = await ctx.sql.unsafe<{ id: string; is_hidden: boolean }[]>(
      `select id, is_hidden from public.reviews order by id`,
    );
    expect(plainRows(restored)).toEqual([
      { id: REVIEW.M, is_hidden: false },
      { id: REVIEW.S, is_hidden: false },
    ]);
  });

  /**
   * The UPDATE policy on `reviews` is NOT dead code, for the same reason the
   * `profiles` UPDATE policies are not: a column grant.
   *
   * `has_table_privilege('authenticated','public.reviews','update')` is `false`
   * — asserted in the test above — and `information_schema.column_privileges`
   * holds UPDATE on `business_rating, comment, product_rating, rating`. So a
   * consumer can edit the text and the numbers of its own review, and "Users can
   * update own reviews" is evaluated on every one of those statements.
   *
   * The four columns NOT on the list are refused, and each refusal is a
   * column-grant refusal, not a policy refusal. Two of them are the ones that
   * matter:
   *
   *   - `is_hidden`: a consumer cannot un-hide its own moderated-away review, so
   *     the moderation decision survives a client that does not accept it.
   *   - `user_id`: a consumer cannot re-attribute its review, so the row cannot
   *     be moved onto somebody else's profile to borrow their reputation.
   *
   * `business_id` is the third and it is the one that closes review fraud: with
   * it, a review could be re-pointed at a competitor without the competitor's
   * order existing.
   *
   * The cross-user arm is the other half and it is a POLICY result, not a grant
   * one: `rating` IS granted, so the statement is permitted and the policy is
   * what returns zero rows. Asserted on the value afterwards, because a
   * `deniedAs` that returns `null` is exactly the same signal for "succeeded" and
   * for "matched nothing".
   */
  test('the reviews UPDATE policy is live for four columns and absent for the rest, and the row scope is the policy', async () => {
    const columns = await ctx.sql.unsafe<{ column_name: string }[]>(
      `select column_name
         from information_schema.column_privileges
        where table_schema = 'public'
          and table_name   = 'reviews'
          and grantee      = 'authenticated'
          and privilege_type = 'UPDATE'
        order by column_name`,
    );
    expect(plainRows(columns).map((c) => c.column_name)).toEqual(
      [...CLIENT_REVIEW_UPDATE_COLUMNS].sort(),
    );

    // Permitted, and the write lands. `rating` 5 -> 1 on the caller's own row.
    const ownEdit = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.reviews set rating = 1 where id = '${REVIEW.M}' returning rating`,
      ),
    );
    expect(
      ownEdit,
      'a consumer cannot edit the rating of its own review, so ' +
        'CLIENT_REVIEW_UPDATE_COLUMNS is wrong or the grant changed',
    ).toBeNull();
    await ctx.sql.unsafe(
      `update public.reviews set rating = 5 where id = '${REVIEW.M}'`,
    );

    // The four refusals, each a column-grant refusal.
    for (const [column, value] of [
      ['is_hidden', 'true'],
      ['moderated_by', `'${ADMIN}'`],
      ['moderation_reason', `'forged'`],
      ['user_id', `'${STRANGER}'`],
      ['business_id', `'${BIZ_B}'`],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `update public.reviews set ${column} = ${value} where id = '${REVIEW.M}' returning id`,
        ),
      );
      expect(
        denial,
        `a consumer was able to write reviews.${column} on its own review`,
      ).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table reviews');
      expect(
        denial?.message,
        `the refusal on reviews.${column} came from RLS rather than from the ` +
          `column grant, which means the grant now covers it`,
      ).not.toContain('row-level security policy');
    }

    // The row scope, which is the policy and only the policy. `rating` IS
    // granted, so this statement raises nothing and updates nothing.
    const crossUser = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.reviews set rating = 1 where id = '${REVIEW.S}' returning rating`,
      ),
    );
    expect(
      crossUser,
      'editing another consumer’s review raised an error rather than matching ' +
        'zero rows. A raised error would mean the GRANT changed, and the row ' +
        'scope below is no longer the thing doing the filtering.',
    ).toBeNull();

    const state = await ctx.sql.unsafe<{ id: string; rating: number }[]>(
      `select id, rating from public.reviews order by id`,
    );
    expect(plainRows(state)).toEqual([
      { id: REVIEW.M, rating: 5 },
      { id: REVIEW.S, rating: 4 },
    ]);
  });

  /**
   * `anon` cannot UPDATE and cannot name a column to UPDATE, both refused at the
   * grant.
   *
   * A separate arm from the one above because the two roles are refused for
   * different reasons that happen to produce the same SQLSTATE: `anon` has no
   * UPDATE privilege on any column, `authenticated` has it on four. The message
   * is the same and the layer is the same, and the test exists so a future
   * migration that widened `anon` fails here with a clear name on it.
   */
  test('anon cannot update a review at all, and the refusal is the grant', async () => {
    for (const statement of [
      `update public.reviews set comment = 'anon edit' returning id`,
      `update public.reviews set rating = 1 where id = '${REVIEW.M}' returning id`,
    ]) {
      const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
        tx.unsafe(statement),
      );
      expect(denial, `anon was able to run: ${statement}`).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table reviews');
      expect(denial?.message).not.toContain('row-level security policy');
    }
  });
});

describe('the anon insert', () => {
  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * The finding was: the anon insert is refused by the `WITH CHECK`, and the
   * mechanism is a three-valued-logic coincidence rather than a design.
   *
   *     '1111…'::uuid = auth.uid()   ->  NULL, not false
   *
   * The policy never said "an anonymous caller may not post". It said "the row's
   * user_id must be the caller's", and with no caller that comparison was
   * undefined. It happened to be safe because a NULL `WITH CHECK` is treated as
   * not-satisfied — and the next test showed the accident had a hole.
   *
   * ─── WHAT IT CONCLUDES NOW, AND WHY THE MECHANISM CHANGED ─────────────────
   *
   * The refusal is STILL a policy refusal with the SAME message, and that is
   * asserted below, because a reader who saw "the gate moved" would reasonably
   * expect the error to have changed with it. It did not.
   *
   * What changed is WHY. `Users can insert own reviews` is now `TO authenticated`
   * instead of `TO public` (`20260928192000`), so an `anon` session no longer
   * matches the policy at all. Postgres reports "no applicable policy" in exactly
   * the same words as "the applicable policy said no", and both are `42501`.
   *
   * That is the whole point of the change, and it is worth being precise about
   * what was bought: the denial is no longer an accident of how NULL compares.
   * It is now a statement about which role the policy was written for. The old
   * form would have been re-opened by a rewrite that reads as a strictness
   * improvement — `user_id is not distinct from auth.uid()` would have ACCEPTED
   * the anonymous request, and only the NOT NULL column would have stood between
   * it and a row, with the error changing to `23502`.
   *
   * The `auth.uid()` probe is KEPT, deliberately. It is the measurement that
   * makes the before/after legible: the predicate is still NULL for an anonymous
   * session, and the policy no longer depends on that being true.
   */
  test('the anon insert is refused by the policy, and the policy no longer applies to the role at all', async () => {
    // The shape of the INSERT policy, read from the catalog. `roles` is the
    // change; `with_check` is the new order check, asserted in full because a
    // partial assertion here is what let the previous version survive the
    // migration unnoticed.
    const policy = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(`select policyname, cmd, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'reviews'
          and policyname = 'Users can insert own reviews'`);

    const insertPolicy = plainRows(policy);
    expect(insertPolicy).toHaveLength(1);
    expect(insertPolicy[0]?.cmd).toBe('INSERT');
    // The gate is still the WITH CHECK, not the USING — there is no old row to
    // qualify on an INSERT, and confusing the two is how a "the policy prevents
    // it" claim gets made about a column nothing constrains.
    expect(insertPolicy[0]?.qual).toBeNull();
    expect(
      insertPolicy[0]?.roles,
      'the INSERT policy is TO public again. That is the state ' +
        '20260928192000 was written to end: `anon` would again be inside the ' +
        'policy, and the only thing refusing it would be the NULL arithmetic ' +
        'the next test measures.',
    ).toEqual(['authenticated']);
    expect(insertPolicy[0]?.with_check).toContain('order_id IS NOT NULL');
    expect(insertPolicy[0]?.with_check).toContain('auth.uid()');
    expect(insertPolicy[0]?.with_check).toContain(
      'o.business_id = reviews.business_id',
    );
    expect(insertPolicy[0]?.with_check).toContain(
      'o.user_id = reviews.user_id',
    );

    // Why `anon` has no `user_id` to satisfy the old predicate: the claim is
    // absent, so `auth.uid()` is NULL. Measured, because "it must be NULL" was
    // the entire old mechanism and a harness that always set a sub would not
    // have seen it. It is still NULL — the predicate is still NULL — and the
    // policy no longer cares.
    const mechanism = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, unknown>[]>(`
        select auth.uid() is null                                          as uid_null,
               ('${MEMBER}'::uuid = auth.uid()) is null                    as predicate_is_null,
               ('${MEMBER}'::uuid = auth.uid()) is not true                as predicate_not_true,
               coalesce('${MEMBER}'::uuid = auth.uid(), false)            as coalesced_to_false`),
    );
    expect(plainRows(mechanism)[0]).toEqual({
      uid_null: true,
      predicate_is_null: true,
      predicate_not_true: true,
      coalesced_to_false: false,
    });

    // And the refusal itself: a POLICY error, not a grant error, and the SAME
    // policy error as before the migration. `anon` still holds the INSERT grant
    // on this table, so if the message ever says `permission denied for table
    // reviews` this file would be describing a different database.
    const before = await reviewCount();
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_A}', 5, 'RLS anon forged review') returning id`,
      ),
    );

    expect(
      denial,
      'anon inserted a review attributed to a signed-in user. This is the ' +
        'abuse path the INSERT grant on reviews exists to prevent, and it is ' +
        'open.',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'new row violates row-level security policy',
    );
    expect(denial?.message).toContain('reviews');
    expect(
      denial?.message,
      'the anon insert was refused by the GRANT rather than by the policy. ' +
        'anon holds INSERT on reviews, so this would mean the privilege is gone.',
    ).not.toContain('permission denied for table reviews');

    // Nothing landed, on the count rather than on the absence of an error.
    expect(await reviewCount()).toBe(before);
  });

  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * The sharpest sentence this file used to hold: `anon` with a sub-claim
   * forges a review attributed to that user, and the INSERT policy permits it,
   * because `WITH CHECK (user_id = auth.uid())` is satisfied by a claim and a
   * claim is not something the ROLE grants. The row landed public, moved
   * `businesses.rating`, and the only mitigation was the victim noticing and
   * deleting it.
   *
   * ─── WHAT IT CONCLUDES NOW ─────────────────────────────────────────────────
   *
   * Refused, by the same `42501` policy error, and nothing lands. The policy is
   * `TO authenticated`, so a session whose current_role is `anon` does not match
   * it no matter what claims it carries.
   *
   * The severity note from the file header is KEPT and is the reason this is a
   * fix and not an incident write-up: forging that `sub` requires the JWT
   * signing secret, so this was not reachable with the public anon key. What
   * WAS reachable with the public anon key is fixed by the order check in the
   * same migration, and asserted in `the reviews insert, after 20260928192000`.
   *
   * The negative assertions below are the load-bearing half, because "the insert
   * failed" is also what a test sees if the whole statement was malformed. So
   * each one is paired with the same statement succeeding as `authenticated`
   * where a legitimate version of it exists.
   */
  test('anon with a sub-claim cannot insert, and the policy no longer covers the role', async () => {
    const before = await reviewCount();

    const refused = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
         values ('${MEMBER}', '${BIZ_A}', '${ORDER.R}', 1, 1, 1, 'RLS anon forged with a sub')
         returning id`,
      ),
    );
    expect(
      refused,
      'anon with a sub-claim inserted a review. This insert is otherwise ' +
        'LEGITIMATE — it is MEMBER’s own order at MEMBER’s own business — so the ' +
        'only thing that can refuse it is the role, which is the point: the ' +
        'policy is TO authenticated and the role here is anon.',
    ).not.toBeNull();
    expect(refused?.code).toBe('42501');
    expect(
      refused?.message,
      'the refusal is not a policy refusal, so the gate is not the one this ' +
        'migration moved. anon still holds the INSERT grant.',
    ).toContain('new row violates row-level security policy');

    // The row is absent, and absent for the second reason too: this insert would
    // be legal for `authenticated`, so a leftover row would mean the statement
    // was refused by something incidental.
    const forged = await ctx.sql.unsafe<{ c: number }[]>(
      `select count(*)::int as c from public.reviews
        where comment = 'RLS anon forged with a sub'`,
    );
    expect(plainRows(forged)[0]?.c).toBe(0);
    expect(await reviewCount()).toBe(before);

    // And the same statement, unchanged, as the role the policy names. This is
    // the control that turns "it failed" into "it failed BECAUSE of the role":
    // without it the previous assertion is satisfied by any failure at all,
    // including a typo in the SQL above.
    const landedForTheRealUser = await deniedAs(
      ctx.sql,
      'authenticated',
      MEMBER,
      (tx) =>
        tx.unsafe(
          `insert into public.reviews
             (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
           values ('${MEMBER}', '${BIZ_A}', '${ORDER.R}', 1, 1, 1, 'RLS anon forged with a sub')
           returning id`,
        ),
    );
    expect(
      landedForTheRealUser,
      'the identical statement was refused as `authenticated` too, so the ' +
        'asymmetry above is not about the role — this migration broke the ' +
        'legitimate path as well.',
    ).toBeNull();

    // `deniedAs` COMMITS on the success path, so the row the control just
    // created is real and has to be removed, whether or not the assertion above
    // held. Unconditional, and in a `finally` so a failed assertion cannot skip
    // it and leave the rest of the file measuring a probe row.
    try {
      expect(
        await reviewCount(),
        'the control insert did not land, so the assertion that it succeeded is ' +
          'measuring something else',
      ).toBe(before + 1);
    } finally {
      await ctx.sql.unsafe(
        `delete from public.reviews where comment = 'RLS anon forged with a sub'`,
      );
    }
    expect(await reviewCount()).toBe(before);
  });

  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * "anon with a sub-claim can only forge as the user that claim names." It was
   * worth pinning: the forged row had to name the same id the claim did, which
   * is what made the finding a wrong-attribution hole rather than an open door.
   *
   * ─── WHY IT NO LONGER SAYS ANYTHING, AND WHY IT WAS NOT LEFT AS IT WAS ─────
   *
   * It kept PASSING after the migration, and that is exactly the problem. With
   * the policy `TO authenticated`, BOTH attempts are refused — the one naming
   * the claim's own user and the one naming somebody else — so "can only forge as
   * the user the claim names" became true for the same reason "cannot forge at
   * all" is: nothing is inserted. A test that passes because the thing it
   * measures no longer exists is not evidence, and leaving it would have put a
   * green check in this file that a reader would reasonably take as a bound.
   *
   * What replaces it is the same statement with the roles swapped, which is the
   * half that still means something: a real signed-in consumer still cannot
   * write a review attributed to somebody else. The wrong-attribution property
   * was never the finding — the claim-forging one was — but it is still true and
   * still worth a line.
   */
  test('a signed-in consumer still cannot write a review attributed to somebody else', async () => {
    const before = await reviewCount();

    const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
         values ('${STRANGER}', '${BIZ_A}', '${ORDER.S}', 1, 1, 1, 'RLS written as somebody else')`,
      ),
    );

    expect(
      denial,
      'a consumer signed in as MEMBER wrote a review attributed to STRANGER. ' +
        'The WITH CHECK compares user_id to the caller, so nothing should have ' +
        'let this through.',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'new row violates row-level security policy',
    );
    expect(
      denial?.message,
      'the refusal came from a foreign key, which would mean STRANGER has no ' +
        'profile row in this fixture rather than that the policy refused it',
    ).not.toContain('violates foreign key constraint');

    expect(await reviewCount()).toBe(before);
  });
});

describe('the moderation columns a client could write', () => {
  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * #2, measured: a signed-in client COULD write `is_hidden`, `moderated_by`,
   * `moderated_at`, `moderation_reason` and `hidden_reason` on INSERT, and the
   * row landed with exactly the values it sent. `users: [public]` plus INSERT on
   * all 15 columns put the moderation surface inside the INSERT grant, and the
   * only thing on the table that touched a moderation column was the CHECK
   * `reviews_moderation_reason_required` — which constrains WHAT, never WHO. A
   * client that hid its own review had to supply a reason and could invent one.
   *
   * The consequence that was measured, and it is the reason this was more than
   * cosmetic: the inserted row was invisible to the anonymous feed immediately,
   * and `update_business_rating()` filters `is_hidden is not true`, so it
   * contributed nothing to the average or the count. A one-star review could
   * arrive at a business, take itself out of the public feed, and leave the
   * rating untouched — a review that removes itself on arrival.
   *
   * ─── WHAT IT CONCLUDES NOW ─────────────────────────────────────────────────
   *
   * A `BEFORE INSERT` trigger resets all five columns
   * (`20260928192000_close_reviews_insert_and_narrow_policies.sql`). The client
   * still HOLDS the grant on those columns and the statement still SUCCEEDS —
   * what changed is that the values it sent are discarded before the row exists.
   *
   * That is a different layer from the one that used to be measured here, and
   * the distinction is the whole point: a trigger that overwrites is not a grant
   * that refuses. The same sentence covers both, and only one of them is still
   * true after the next migration touches the ACLs.
   *
   * Note what the trigger is NOT: it is not role-conditional. It does not ask
   * who is calling, so it holds for `service_role` too, and no
   * `auth_helpers.my_role()` call is made from inside it. That is sound because
   * moderation is an UPDATE and always has been — `ReviewsModerationService.hide`
   * and `.unhide` both route to `ReviewsRepository.setHidden` — so no legitimate
   * writer ever inserts a hidden review.
   *
   * Both probes below now carry an `order_id`. They did not before, and the
   * reason is the sibling migration rather than this one: the INSERT policy now
   * requires the order. A probe that omits it would be refused by the policy
   * before the trigger ever ran, and the test would pass while measuring
   * nothing about moderation.
   */
  test('a client can still send the moderation columns, and a BEFORE INSERT trigger discards all five', async () => {
    // The trigger set, so the "which layer catches this" claim is a measurement
    // and not a recollection of the migration.
    const triggers = await ctx.sql.unsafe<{ tgname: string; def: string }[]>(
      `select t.tgname, pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'reviews' and not t.tgisinternal
        order by t.tgname`,
    );
    const byName = new Map(plainRows(triggers).map((t) => [t.tgname, t.def]));

    expect([...byName.keys()]).toEqual([
      'on_review_change',
      'on_review_offer_change',
      'set_reviews_updated_at',
      'trg_reviews_unmoderated_on_insert',
    ]);

    // The new one is BEFORE INSERT, and the two that fire on INSERT for other
    // reasons are still AFTER. The ordering is the argument: a BEFORE trigger
    // runs before the row exists, an AFTER one derives an aggregate from it.
    // If the reset had been an AFTER trigger it would have arrived too late to
    // be a reset.
    expect(
      byName.get('trg_reviews_unmoderated_on_insert'),
      'the reset trigger is gone or changed shape. Everything below measures ' +
        'that it fires BEFORE INSERT, so assert the change deliberately if it ' +
        'happens.',
    ).toContain('BEFORE INSERT ON public.reviews');
    for (const name of ['on_review_change', 'on_review_offer_change']) {
      expect(byName.get(name)).toContain('AFTER INSERT OR DELETE OR UPDATE');
    }
    expect(byName.get('set_reviews_updated_at')).toContain('BEFORE UPDATE');

    // The function itself is SECURITY INVOKER and reads no table, which is why
    // it needs no privilege of its own and why it cannot be a route to anything
    // but the row it was handed.
    const fn = await ctx.sql.unsafe<{ secdef: boolean; reads: boolean }[]>(
      `select prosecdef as secdef,
              prosrc ~* '\\bfrom\\b|\\binsert\\b|\\bupdate\\b|\\bdelete\\b|\\bselect\\b' as reads
         from pg_proc
        where proname = 'default_reviews_unmoderated_on_insert'`,
    );
    expect(plainRows(fn)).toEqual([{ secdef: false, reads: false }]);

    const before = await reviewCount();

    /**
     * ─── Why the cleanup wraps the WHOLE body, and not the end of it ──────────
     *
     * The first draft of the previous version of this test put the DELETE in a
     * `try { … } finally { … }` around a trailing FK assertion, which put it
     * AFTER every behavioural probe. The first probe's aggregate assertion then
     * failed, the `finally` was never reached, and the hidden review stayed in
     * the table for the next six tests — each of which failed on a count that
     * was one too high, with a message that pointed at the wrong thing entirely.
     *
     * That is the exact failure `businesses.rls.db.spec.ts` documents in its own
     * counterfactual ("the first draft of this test reset between the two
     * probes"), and the shape is identical: a cleanup that does not cover the
     * probes corrupts the measurements around it, and the corruption reads as
     * findings. A `finally` that only covers part of the body is not a cleanup.
     *
     * So the DELETE is in a `finally` around everything below, and the FK check
     * that justifies it runs INSIDE it as a guard rather than outside it as a
     * gate — because a gate that fails throws, and a throwing gate before the
     * cleanup is a cleanup that never runs.
     */
    try {
      // The client supplies the moderation state AND stamps a real admin as the
      // moderator, on a legitimate order of its own. The statement is accepted:
      // the INSERT grant is untouched by this migration, and the policy is
      // satisfied because ORDER.R really is MEMBER's at BIZ_A.
      const inserted = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.reviews
             (user_id, business_id, order_id, rating, comment, is_hidden, moderated_by,
              moderated_at, moderation_reason, hidden_reason)
           values ('${MEMBER}', '${BIZ_A}', '${ORDER.R}', 5, 'RLS self-moderated', true,
                   '${ADMIN}', now(), 'client supplied this', 'client also supplied this')
           returning id, is_hidden, moderated_by::text, moderation_reason, hidden_reason`,
        ),
      );
      expect(
        inserted,
        'the INSERT was refused, so this test is measuring the POLICY rather ' +
          'than the trigger. A client writing the moderation columns on a ' +
          'legitimate order is still accepted — the grant was not changed — and ' +
          'the values it sent are what the trigger is expected to discard.',
      ).toBeNull();

      // Re-read as the owner, because reading it back through a client session
      // would go through the moderation SELECT policy this test is not about.
      // All five columns, all reset, and `moderated_by` is NULL rather than the
      // admin the client named — the falseable half, and the one that was the
      // sharpest part of the old finding.
      const landed = await ctx.sql.unsafe<
        {
          user_id: string;
          comment: string;
          is_hidden: boolean;
          moderated_by: string | null;
          moderated_at_set: boolean;
          moderation_reason: string | null;
          hidden_reason: string | null;
        }[]
      >(
        `select user_id::text, comment, is_hidden, moderated_by::text,
                moderated_at is not null as moderated_at_set,
                moderation_reason, hidden_reason
           from public.reviews
          where comment = 'RLS self-moderated'`,
      );
      expect(
        plainRows(landed),
        'the row kept the moderation values the client sent, or the trigger ' +
          'reset only some of them. All FIVE are reset: resetting only the flag ' +
          'would leave a row claiming it was hidden by an account that never ' +
          'saw it, which is the same falseable trail with one field repaired.',
      ).toEqual([
        {
          user_id: MEMBER,
          comment: 'RLS self-moderated',
          is_hidden: false,
          moderated_by: null,
          moderated_at_set: false,
          moderation_reason: null,
          hidden_reason: null,
        },
      ]);

      // The soft-hide escape is CLOSED, and this is the assertion that says so.
      // Before the migration this row was absent from the anonymous feed on the
      // client's own say-so. It is present now, which is what a review that
      // cannot delete itself looks like.
      const inAnonFeed = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews where comment = 'RLS self-moderated'`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      );
      expect(
        inAnonFeed,
        'a review the client tried to insert already hidden is in the ' +
          'anonymous feed. Before the trigger it was not, and that absence was ' +
          'the finding: a 1-star review that removed itself from the feed and ' +
          'from the average on arrival.',
      ).toEqual(['RLS self-moderated']);

      // The aggregate consequence, which INVERTED rather than merely changed.
      // `update_business_rating()` filters `is_hidden is not true`, so a hidden
      // row was excluded from both halves. This row is visible now, and it
      // carries `rating` with `business_rating` NULL, so `avg()` skips it: the
      // count moves by one and the average does not. The baseline is the two
      // seeded reviews (5 and 4 → 4.50) and both halves are asserted, because
      // "the count moved" is only interesting next to "the average did not".
      const aggregate = await ctx.sql.unsafe<
        { rating: string; review_count: number }[]
      >(
        `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
      );
      expect(
        plainRows(aggregate),
        'the self-moderated review did not reach the aggregate as a visible ' +
          'row. Before the trigger this assertion read 4.50 / 2 — the row was ' +
          'excluded precisely because the client had hidden it.',
      ).toEqual([{ rating: '4.50', review_count: 3 }]);

      // And the OTHER direction: a client that writes the moderation columns to
      // make a review look APPROVED gets the same answer, and the reason token
      // it sent is discarded. Asserted because "the flag is reset" would not
      // cover a client forging a reason string, and `moderation_reason` is the
      // column the CHECK constraint reasons about.
      const publicOnInsert = await deniedAs(
        ctx.sql,
        'authenticated',
        MEMBER,
        (tx) =>
          tx.unsafe(
            `insert into public.reviews
               (user_id, business_id, order_id, rating, comment, is_hidden, moderation_reason)
             values ('${MEMBER}', '${BIZ_A}', '${ORDER.Q}', 5, 'RLS published on insert', false, 'approved')
             returning id, is_hidden`,
          ),
      );
      expect(
        publicOnInsert,
        'a client could not insert a review on its own order at all. That is ' +
          'the INSERT policy refusing a legitimate write, which is a different ' +
          'failure from the one this test is about.',
      ).toBeNull();

      const published = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string; moderation_reason: string | null }[]>(
            `select comment, moderation_reason from public.reviews
              where comment = 'RLS published on insert'`,
          )
          .then((rows) =>
            rows.map((r) => ({
              comment: r.comment,
              reason: r.moderation_reason,
            })),
          ),
      );
      expect(
        published,
        "the client's approval token survived the insert. The row is public — " +
          'correct, and unchanged, because there is no approval step on this ' +
          'table and never was — but the moderation_reason it sent must be gone.',
      ).toEqual([{ comment: 'RLS published on insert', reason: null }]);

      // Both rows now count, so the aggregate is 4.50 / 4: two seeded reviews
      // at 5 and 4, plus two client rows that carry no `business_rating`.
      const afterBoth = await ctx.sql.unsafe<
        { rating: string; review_count: number }[]
      >(
        `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
      );
      expect(
        plainRows(afterBoth),
        'the aggregate did not reach 4.50 / 4. Both client rows are visible ' +
          'now, and both left `business_rating` NULL, so the count is ' +
          'client-controlled while the average is not — which is the same ' +
          'asymmetry the old version of this test measured, with the hiding ' +
          'half taken away.',
      ).toEqual([{ rating: '4.50', review_count: 4 }]);
    } finally {
      /**
       * The DELETE, and it is the only statement in this `finally` — a finally
       * stops at its first throw, and this is the one that has to run.
       *
       * Nothing references `public.reviews`, which is what makes a plain DELETE
       * safe here. That is a property of THIS schema rather than of the table,
       * and it is the reason the DELETE is wrapped in `.catch()` rather than left
       * to raise: a future migration adding an incoming foreign key would turn
       * this cleanup into a second failure inside a `finally`, and a throwing
       * cleanup at the end of a `finally` is indistinguishable from a finding.
       * The assertion after the block is what makes a swallowed cleanup loud.
       *
       * The two `on_review_*` triggers are AFTER DELETE, so the aggregate is
       * recomputed on the way out and the business row is back to its seeded
       * value without this test having to write it back.
       */
      await ctx.sql
        .unsafe(
          `delete from public.reviews
            where comment in ('RLS self-moderated', 'RLS published on insert')`,
        )
        .catch(() => {});
    }

    // The seeded rows are back to the state the file started from, and the
    // business aggregate is back with them. Asserted because a leaked probe row
    // would make every later visibility assertion in this file pass for the
    // wrong reason.
    expect(await reviewCount()).toBe(before);
    const restored = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(restored)).toEqual([{ rating: '4.50', review_count: 2 }]);
  });

  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * "The moderation columns are insert-writable and update-inert, which is an
   * asymmetry not a boundary." A client could write `is_hidden` on INSERT and
   * could not write it on UPDATE, both halves being the same column grant seen
   * from two directions. The stated consequence was strange and worth
   * recording: the client chose the review's moderation state at birth and could
   * never change it — not to un-hide one it hid, not to hide one a real admin
   * published. The moderation decision was a property of the INSERT, not a state
   * the row moved through.
   *
   * ─── WHAT IT CONCLUDES NOW: THE ASYMMETRY IS GONE, AND THE TWO DIRECTIONS
   * ARE CLOSED BY TWO DIFFERENT KINDS OF LAYER ───────────────────────────────
   *
   *   INSERT → a TRIGGER. `trg_reviews_unmoderated_on_insert` overwrites the
   *            values. This survives being re-granted, because it is not
   *            consulted about privileges at all.
   *   UPDATE → a COLUMN GRANT. `authenticated` holds no UPDATE privilege on
   *            these five, and the refusal is `42501 permission denied for
   *            table reviews` — the ACL, not RLS.
   *
   * Naming that difference is the point of keeping this test. "A client cannot
   * write the moderation columns" is one sentence covering two mechanisms, and
   * only the trigger half is guaranteed to still be true after a routine
   * migration touches the grants. This ledger has the receipt: `20260925163235`
   * revoked everything on `businesses` and `20260925224820` put it back twenty
   * minutes later.
   *
   * So the UPDATE half is asserted HERE, as a grant, with its error code, and is
   * deliberately not described as a boundary. It is a convention.
   */
  test('the moderation columns are discarded on INSERT by a trigger and refused on UPDATE by the grant', async () => {
    const canWrite = async (
      column: string,
      value: string,
    ): Promise<{ code: string; message: string } | null> =>
      deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `update public.reviews set ${column} = ${value} where id = '${REVIEW.M}' returning id`,
        ),
      );

    for (const [column, value] of [
      ['is_hidden', 'true'],
      ['moderated_by', `'${ADMIN}'`],
      ['moderated_at', 'now()'],
      ['moderation_reason', `'client said so'`],
      ['hidden_reason', `'client said so'`],
    ] as const) {
      const denial = await canWrite(column, value);
      expect(
        denial,
        `reviews.${column} became UPDATE-writable, so the insert/update ` +
          'asymmetry this test used to describe is gone',
      ).not.toBeNull();
      // The layer is asserted, not assumed. This is the GRANT and not RLS: an
      // RLS refusal on UPDATE would be a policy error, and would mean this
      // table had gained an UPDATE boundary it has never had.
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table reviews');
      expect(
        denial?.message,
        `reviews.${column} was refused by RLS rather than by the column grant. ` +
          'That would be a DIFFERENT and stronger defence than the one this ' +
          'test claims, and it would change what the migration header says.',
      ).not.toContain('row-level security policy');
    }

    // And the INSERT half, stated as the complement: same columns, same client,
    // accepted by the grant and discarded by the trigger. One probe is enough —
    // the previous test asserts all five on a real insert.
    const inserted = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, rating, comment, is_hidden, moderation_reason)
         values ('${MEMBER}', '${BIZ_A}', '${ORDER.R}', 5, 'RLS insert half', true, 'client said so')
         returning id`,
      ),
    );
    expect(
      inserted,
      'the INSERT was refused. The column grant was NOT changed by this ' +
        'migration, so a refusal here means the statement is being stopped by ' +
        'something other than the trigger the previous test measures.',
    ).toBeNull();
    try {
      const kept = await ctx.sql.unsafe<
        { is_hidden: boolean; moderation_reason: string | null }[]
      >(
        `select is_hidden, moderation_reason from public.reviews
          where comment = 'RLS insert half'`,
      );
      expect(plainRows(kept)).toEqual([
        { is_hidden: false, moderation_reason: null },
      ]);
    } finally {
      await ctx.sql
        .unsafe(`delete from public.reviews where comment = 'RLS insert half'`)
        .catch(() => {});
    }

    // Both seeded rows unchanged, read as the owner. `is_hidden` and the reason
    // column are the two that matter: a client that could write either would be
    // rewriting a moderation decision.
    const state = await ctx.sql.unsafe<
      { id: string; is_hidden: boolean; moderated_by: string | null }[]
    >(
      `select id, is_hidden, moderated_by::text from public.reviews order by id`,
    );
    expect(plainRows(state)).toEqual([
      { id: REVIEW.M, is_hidden: false, moderated_by: null },
      { id: REVIEW.S, is_hidden: false, moderated_by: null },
    ]);
  });
});

describe('the anon delete', () => {
  /**
   * #3, asserted on the COUNT and not on the exception, because there is no
   * exception: `anon` holds the DELETE grant, and no DELETE policy on `reviews`
   * applies to it at all since `20260928192000` moved the policy to
   * `TO authenticated`. The statement SUCCEEDS and deletes zero rows.
   *
   * The consequence is stated here because it is the part that survives into
   * production behaviour: the refusal is SILENT. A client that checks for an
   * error and not for a row count will conclude it deleted a review it did not
   * delete. That is not a database bug, it is the ordinary contract of a
   * PERMISSIVE DELETE policy that matches no row, and it is the exact opposite
   * of the write paths on `orders` in `orders.rls.db.spec.ts`, where the revoke
   * turned the same statement shape into a `42501`. Same statement, opposite
   * outcome, purely because of the grant.
   *
   * This is NOT a new finding and NOT a regression from the migration. The
   * no-claim arm behaved this way before it and behaves this way now; only the
   * reason changed, from NULL arithmetic to role mismatch. Both are spelled out
   * where the two arms are compared below.
   *
   * So the assertion is deliberately about the count and the assertions about
   * `deniedAs` returning `null` are supporting evidence, not the claim. A test
   * that asserted "no error" alone would pass on a database where `anon` deleted
   * everything.
   */
  test('anon delete returns no error and removes nothing, and the refusal is silent', async () => {
    const before = await reviewCount();
    expect(before, 'the fixture is not in its seeded state').toBe(2);

    // The `where true` form is deliberate: it is the statement that WOULD delete
    // everything if the policy let it. It matches every row and the policy keeps
    // every row, which is the sharpest possible form of the measurement.
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`delete from public.reviews where true`),
    );
    expect(
      denial,
      'the anon delete RAISED. That would mean anon lost the DELETE grant, and ' +
        'this file would be describing a different layer than the one it claims.',
    ).toBeNull();

    expect(
      await reviewCount(),
      'anon holds DELETE on reviews and the statement reported no error, but ' +
        'the count changed — so the DELETE policy is not what stopped it and ' +
        'this test was asserting a no-op',
    ).toBe(before);

    // `returning` makes the silence visible, which is the point: a client that
    // asks for the deleted rows gets an empty list, not an error and not the row
    // it expected.
    const returning = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`delete from public.reviews returning id`),
    );
    expect(returning, 'delete … returning raised for anon').toBeNull();
    expect(await reviewCount()).toBe(before);

    // ─── WHAT THE CLAIM ARMS CONCLUDED BEFORE ────────────────────────────────
    //
    // This was the sharpest thing in the file: the SAME role, the same policy,
    // the same statement shape — with a claim. The only difference was
    // `auth.uid()` being NULL instead of set, and the count is what separated
    // them. `anon` with a sub for a real user deleted that user's reviews,
    // silently, in both directions: the no-claim delete raised nothing and
    // removed nothing, and the claimed delete raised nothing and removed
    // everything that user wrote.
    //
    // It was worse than a delete primitive, because it removed the table's only
    // mitigation. The victim could delete a forged review attributed to them —
    // that was the one escape — and the same party that planted the row was the
    // one holding the claim that could take it away again, silently.
    //
    // ─── WHAT THEY CONCLUDE NOW, AND WHY THE SILENCE IS NOT A NEW FINDING ────
    //
    // Both arms remove nothing. `Users can delete own reviews` is
    // `TO authenticated` (`20260928192000`), so an `anon` session matches no
    // DELETE policy at all and `where true` matches zero rows.
    //
    // The no-claim arm is UNCHANGED, and that is worth saying rather than
    // leaving implied: before the migration it was refused by NULL arithmetic,
    // and now it is refused because the policy does not apply. Same outcome,
    // same absence of an error — and the difference only shows up in the arm
    // below, which is the whole reason the narrowing was worth doing.
    //
    // The silence is therefore NOT a new finding and NOT a regression. A
    // PERMISSIVE DELETE policy that matches no row is a successful statement
    // that deleted nothing, whatever the reason nothing matched, and a client
    // checking for an error rather than a count is still misled. This migration
    // did not fix that and does not claim to; the fix for that is a statement
    // that raises, which is a grant change and out of scope here.
    const withClaim = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(`delete from public.reviews where true`),
    );
    expect(
      withClaim,
      'anon with MEMBER’s sub-claim raised on delete. A missing DELETE policy ' +
        'is a silent zero-row match, not an error, so a raise here would mean ' +
        'something other than the policy is deciding — check the grants.',
    ).toBeNull();

    const afterClaim = await ctx.sql.unsafe<{ id: string; user_id: string }[]>(
      `select id, user_id::text from public.reviews order by id`,
    );
    expect(
      plainRows(afterClaim),
      'anon with a sub-claim deleted rows. The DELETE policy is TO ' +
        'authenticated, so the role decides and not the claim — this is the ' +
        'arm the narrowing exists for, and both seeded rows must survive.',
    ).toEqual([
      { id: REVIEW.M, user_id: MEMBER },
      { id: REVIEW.S, user_id: STRANGER },
    ]);

    // The control, kept because it costs one statement and it separates "the
    // role was refused" from "there was nothing to delete anyway": a claim for
    // ADMIN, who wrote no reviews, must also leave both rows alone.
    const noRowsClaim = await deniedAs(ctx.sql, 'anon', ADMIN, (tx) =>
      tx.unsafe(`delete from public.reviews where true`),
    );
    expect(
      noRowsClaim,
      'anon with a claim for a user with no reviews raised',
    ).toBeNull();
    const afterControl = await ctx.sql.unsafe<{ id: string }[]>(
      `select id from public.reviews order by id`,
    );
    expect(
      plainRows(afterControl),
      'a claim for a user with no reviews removed somebody else’s row',
    ).toEqual([{ id: REVIEW.M }, { id: REVIEW.S }]);

    // No restore is needed, and the absence is asserted rather than assumed: the
    // previous version of this test had to re-insert REVIEW.M because the claim
    // arm had genuinely deleted it, and a version that still re-inserted would
    // be silently overwriting a row that is supposed to be there.
    expect(await reviewCount()).toBe(before);
  });

  /**
   * The positive half, so the DELETE surface is a measured pair and not a
   * one-sided claim: a consumer deletes its OWN review and not anybody else's,
   * both silently, and the count is the discriminator in both directions.
   *
   * The cross-user arm matters because `user_id` is not in the UPDATE column
   * grant but DELETE is table-level, so the ONLY thing keeping a consumer away
   * from another consumer's review is `USING (user_id = auth.uid())`. That is a
   * policy, and it is the sole boundary — which is why it is worth a test of its
   * own and why the count rather than the absence of an error is what it asserts.
   */
  test('a consumer deletes its own review and not another one’s, and the policy is the only boundary', async () => {
    const own = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(`delete from public.reviews where id = '${REVIEW.M}'`),
    );
    expect(own, 'a consumer could not delete its own review').toBeNull();
    expect(
      await reviewCount(),
      'the own-review delete did not land, so the policy allowed the statement ' +
        'and something else refused it',
    ).toBe(1);

    const other = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(`delete from public.reviews where id = '${REVIEW.S}'`),
    );
    expect(
      other,
      'deleting another consumer’s review raised rather than matching nothing',
    ).toBeNull();
    expect(
      await reviewCount(),
      'a consumer deleted a review belonging to somebody else. The DELETE ' +
        'policy is `user_id = auth.uid()` and the table grant is table-wide, so ' +
        'there is no other layer between them.',
    ).toBe(1);

    const stillThere = await ctx.sql.unsafe<{ id: string; user_id: string }[]>(
      `select id, user_id::text from public.reviews`,
    );
    expect(plainRows(stillThere)).toEqual([
      { id: REVIEW.S, user_id: STRANGER },
    ]);

    // Put the fixture back, in a `finally`-shaped statement that cannot fail on
    // a foreign key: `on conflict (id) do nothing` so it is safe to re-run, and
    // the three rating columns written so the derived business aggregate is the
    // one the rest of the file expects.
    await ctx.sql.unsafe(`
      insert into public.reviews
        (id, user_id, business_id, order_id, rating, business_rating, product_rating, comment)
      values ('${REVIEW.M}', '${MEMBER}', '${BIZ_A}', '${ORDER.M}', 5, 5, 5, 'RLS review mine')
      on conflict (id) do nothing
    `);
    expect(await reviewCount()).toBe(2);
  });
});

describe('the soft-hide', () => {
  /**
   * #4: a hidden review leaves the public feed and stays readable by its author.
   *
   * `Anyone can view non-hidden reviews` is `TO public`, `FOR SELECT`, and its
   * `qual` is `is_hidden IS NOT TRUE OR user_id = auth.uid()`. The second
   * disjunct is what makes this correct rather than merely strict: a consumer
   * can always see what it wrote, including after a moderator removed it, so it
   * can tell "my review was hidden" from "my review is gone".
   *
   * It is worth pinning BECAUSE it is counterintuitive in a security test suite,
   * where every other assertion in this file is about a role seeing LESS. Here
   * the author sees MORE than the anonymous reader, and the assertion is that it
   * is exactly the author and not anyone else. The `IS NOT TRUE` spelling also
   * matters: it treats NULL as visible, so a review with `is_hidden = NULL` would
   * be public — and the column is NOT NULL with a `false` default, so that
   * cannot happen. Asserted, so the reason the disjunct is safe is a fact rather
   * than a hope.
   *
   * The state changes here, so the restore is in a `finally` and it writes the
   * SOURCE column, not a copy. The two rating triggers are `AFTER UPDATE` and
   * recompute the aggregate from the reviews table, so an un-hide automatically
   * restores `businesses.rating` and `review_count` — and the assertion after
   * the finally re-reads the aggregate rather than trusting the UPDATE.
   */
  test('a hidden review leaves the anonymous feed and stays readable by its author only', async () => {
    // The disjunction, read from the catalog rather than paraphrased.
    const policy = await ctx.sql.unsafe<{ qual: string; roles: string[] }[]>(
      `select qual, roles from pg_policies
        where schemaname = 'public' and tablename = 'reviews'
          and policyname = 'Anyone can view non-hidden reviews'`,
    );
    expect(plainRows(policy)).toEqual([
      {
        qual: '((is_hidden IS NOT TRUE) OR (user_id = ( SELECT auth.uid() AS uid)))',
        roles: ['public'],
      },
    ]);

    // `is_hidden` is NOT NULL, so the `IS NOT TRUE` branch cannot be reached
    // with a NULL and the "NULL is visible" hole does not exist.
    const column = await ctx.sql.unsafe<
      { is_nullable: string; column_default: string | null }[]
    >(
      `select is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = 'reviews'
          and column_name = 'is_hidden'`,
    );
    expect(plainRows(column)).toEqual([
      { is_nullable: 'NO', column_default: 'false' },
    ]);

    // Before the hide, everybody but the two authors reads both rows.
    expect(await visibleReviews(ctx.sql, 'anon', null)).toEqual([
      REVIEW.M,
      REVIEW.S,
    ]);

    // The hide. Written as the owner because no client role can write this
    // column, which is the asymmetry the previous describe pins.
    await ctx.sql.unsafe(
      `update public.reviews
          set is_hidden = true, moderation_reason = 'RLS: harness soft-hide'
        where id = '${REVIEW.M}'`,
    );

    try {
      // The feed: the hidden row is gone for everyone who is not its author.
      expect(
        await visibleReviews(ctx.sql, 'anon', null),
        'a hidden review is still in the anonymous feed',
      ).toEqual([REVIEW.S]);
      expect(
        await visibleReviews(ctx.sql, 'authenticated', STRANGER),
        'a hidden review is visible to a third party, so the `user_id = ' +
          'auth.uid()` disjunct is matching more than the author',
      ).toEqual([REVIEW.S]);
      expect(
        await visibleReviews(ctx.sql, 'authenticated', OWNER),
        'a business owner can see a hidden review of somebody else. There is no ' +
          'owner policy on reviews, so this is asserted to keep it that way.',
      ).toEqual([REVIEW.S]);

      // And the author still sees it, which is the whole point of the disjunct.
      expect(
        await visibleReviews(ctx.sql, 'authenticated', MEMBER),
        'the author of a hidden review cannot see it, so the soft-hide is a ' +
          'hard delete from the author’s point of view and the disjunct in ' +
          '`Anyone can view non-hidden reviews` is not doing its job',
      ).toEqual([REVIEW.M, REVIEW.S].sort());

      // The author reads the moderation state too, not just the row: it can tell
      // WHY it was hidden. `moderation_reason` is one of the client-writable
      // columns from the INSERT probe, and here the database wrote it.
      const authorView = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx
          .unsafe<
            { id: string; is_hidden: boolean; moderation_reason: string }[]
          >(
            `select id, is_hidden, moderation_reason
               from public.reviews where id = '${REVIEW.M}'`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(authorView).toEqual([
        {
          id: REVIEW.M,
          is_hidden: true,
          moderation_reason: 'RLS: harness soft-hide',
        },
      ]);

      // The aggregate follows the visibility: `update_business_rating()`
      // excludes `is_hidden is not true`, so the business drops from two reviews
      // to one. This is the mechanism that makes the soft-hide useful rather
      // than cosmetic, and it is asserted as a value on the business row.
      const aggregate = await ctx.sql.unsafe<
        { rating: string; review_count: number }[]
      >(
        `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
      );
      expect(
        plainRows(aggregate),
        'hiding a review did not drop it out of the business aggregate, so ' +
          '`update_business_rating()` does not filter on is_hidden',
      ).toEqual([{ rating: '4.00', review_count: 1 }]);

      // And the author CAN still edit the hidden review's text — the soft-hide
      // is a moderation decision, not a lock, and the four UPDATE columns do not
      // include anything that would change the state.
      const edit = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `update public.reviews set comment = 'RLS edited while hidden'
            where id = '${REVIEW.M}' returning comment`,
        ),
      );
      expect(edit, 'the author cannot edit a hidden review').toBeNull();
    } finally {
      /**
       * The restore is last in the finally and it is the only statement in it,
       * because a `finally` stops at its first throw. It writes the SOURCE state
       * (`is_hidden`), not the derived copy: the AFTER trigger recomputes
       * `businesses.rating` from the reviews table, so restoring the review
       * restores the aggregate on its own, and the assertion below re-reads it
       * rather than trusting the UPDATE.
       *
       * It cannot fail on a foreign key — it is an UPDATE naming a primary key
       * on a table this file seeded.
       */
      await ctx.sql.unsafe(
        `update public.reviews
            set is_hidden = false, moderation_reason = null, comment = 'RLS review mine'
          where id = '${REVIEW.M}'`,
      );
    }

    // The fixture is back, and the aggregate with it. Asserted because a leaked
    // hide would make every later visibility assertion in this file pass for
    // the wrong reason.
    expect(await visibleReviews(ctx.sql, 'anon', null)).toEqual([
      REVIEW.M,
      REVIEW.S,
    ]);
    const restored = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(restored)).toEqual([{ rating: '4.50', review_count: 2 }]);
  });

  /**
   * The admin is not special-cased on `reviews`, and that is worth a test
   * because "Admins can manage all reviews" is `FOR ALL` and reads `my_role()`.
   *
   * It is a PERMISSIVE policy, so it is ORed with the four `TO public` ones. On a
   * hidden review the admin still sees it, because `my_role() = 'admin'` is
   * true and permissive policies OR. That is the moderation queue's only server
   * side support, and it is the reason the soft-hide is a review decision rather
   * than a deletion.
   *
   * The write half is a different matter and is asserted here rather than in the
   * moderation block, because the refusal is a GRANT: no client role, admin
   * included, holds table-level UPDATE on `reviews`, and the admin's column
   * grant is the same four columns everyone else has. So "Admins can manage all
   * reviews" is a read policy in practice and a write policy only against a
   * column set that excludes every moderation column.
   */
  test('an admin reads a hidden review through the ALL policy, and still cannot write the moderation columns', async () => {
    const policy = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(`select policyname, cmd, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'reviews'
          and policyname = 'Admins can manage all reviews'`);

    expect(plainRows(policy)).toEqual([
      {
        policyname: 'Admins can manage all reviews',
        cmd: 'ALL',
        roles: ['authenticated'],
        qual: "(( SELECT auth_helpers.my_role() AS my_role) = 'admin'::app_role)",
        with_check:
          "(( SELECT auth_helpers.my_role() AS my_role) = 'admin'::app_role)",
      },
    ]);

    // The read. The admin sees the hidden row, and an admin is the only
    // non-author in this file that does.
    await ctx.sql.unsafe(
      `update public.reviews
          set is_hidden = true, moderation_reason = 'RLS: harness admin read'
        where id = '${REVIEW.M}'`,
    );
    try {
      expect(
        await visibleReviews(ctx.sql, 'authenticated', ADMIN),
        'an admin cannot read a hidden review, so there is no moderation queue ' +
          'behind the soft-hide',
      ).toEqual([REVIEW.M, REVIEW.S].sort());
    } finally {
      await ctx.sql.unsafe(
        `update public.reviews
            set is_hidden = false, moderation_reason = null
          where id = '${REVIEW.M}'`,
      );
    }

    // The write. A GRANT refusal, and the negative assertion on the RLS message
    // is the load-bearing half: if this ever came back as
    // `row-level security policy`, the admin policy would have stopped being
    // the only thing in the way, which would mean a grant had appeared.
    for (const statement of [
      `update public.reviews set is_hidden = false, moderation_reason = 'un-hid' where id = '${REVIEW.M}' returning id`,
      `update public.reviews set moderated_by = '${ADMIN}' where id = '${REVIEW.M}' returning id`,
    ]) {
      const denial = await deniedAs(ctx.sql, 'authenticated', ADMIN, (tx) =>
        tx.unsafe(statement),
      );
      expect(
        denial,
        `an admin was able to run: ${statement}. "Admins can manage all reviews" ` +
          `is FOR ALL, so a write it does not perform is a GRANT result.`,
      ).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain('permission denied for table reviews');
      expect(
        denial?.message,
        'the admin write refusal came from RLS rather than from the grant, ' +
          'which means the grant came back on the moderation columns',
      ).not.toContain('row-level security policy');
    }

    // What an admin CAN write is the same four columns, and the row scope is the
    // policy — which for an admin is `my_role()`, so an admin reaches rows it
    // does not own. That is the "manage" half of the policy name and it is
    // asserted because it is the one place in this file where the row scope is
    // genuinely wider than the caller's own data.
    const adminEdit = await deniedAs(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe(
        `update public.reviews set comment = 'RLS admin edited' where id = '${REVIEW.M}' returning comment`,
      ),
    );
    expect(
      adminEdit,
      'an admin cannot edit a review it does not own',
    ).toBeNull();
    await ctx.sql.unsafe(
      `update public.reviews set comment = 'RLS review mine' where id = '${REVIEW.M}'`,
    );
  });

  /**
   * The full policy set on `reviews`, asserted as text, so a widened policy
   * fails on a one-line diff.
   *
   * ─── WHAT THIS ASSERTED BEFORE ─────────────────────────────────────────────
   *
   * "Five policies, four of them TO public", and the absence that mattered was
   * the write half: `anon` reached every row of this table through four
   * `TO public` policies, and the only command none of them governed was the
   * one `anon` could perform without limit — TRUNCATE, since removed.
   *
   * ─── WHAT IT ASSERTS NOW, AND WHY ONE POLICY IS STILL `TO public` ──────────
   *
   * Four of the five are now `TO authenticated`
   * (`20260928192000_close_reviews_insert_and_narrow_policies.sql`). The one
   * that stays is the SELECT policy, and that is a DECISION with a recorded
   * reason, not an oversight left behind:
   *
   *   - `20260927021015` dropped its `to` clause deliberately, writing that
   *     narrowing it to `anon, authenticated` "would be a silent read
   *     regression for any role not named here". Reversing a documented choice
   *     is not this migration's job.
   *   - Its first branch, `is_hidden IS NOT TRUE`, IS the public review feed.
   *     It is consumed by `GET /businesses/public/:id/reviews` and
   *     `GET /offers/:id/reviews`, both `@Public()`, both callable with no
   *     token. Narrowing it would delete the public review feed — a product
   *     change wearing a security fix's clothes.
   *   - It carries no write surface, so there was never a finding here to fix.
   *
   * So the count is one, not zero, and the assertion below says which one and
   * why. A future reader who disagrees with that reasoning can change it in one
   * line here and one in the migration; what they cannot do is do it by
   * accident, because this array is the whole policy set and any edit shows up
   * as a diff.
   */
  test('the policy set on reviews is five policies, and the only one still TO public is the SELECT feed', async () => {
    const rows = await ctx.sql.unsafe<
      { policyname: string; cmd: string; permissive: string; roles: string[] }[]
    >(`select policyname, cmd, permissive, roles
         from pg_policies
        where schemaname = 'public' and tablename = 'reviews'
        order by policyname`);

    expect(plainRows(rows)).toEqual([
      {
        policyname: 'Admins can manage all reviews',
        cmd: 'ALL',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        policyname: 'Anyone can view non-hidden reviews',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        policyname: 'Users can delete own reviews',
        cmd: 'DELETE',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        policyname: 'Users can insert own reviews',
        cmd: 'INSERT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        policyname: 'Users can update own reviews',
        cmd: 'UPDATE',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
    ]);

    // Said a second way, so a future migration that widens a write policy back
    // to `public` fails on the count rather than inside a five-element array —
    // and named by NAME, so the one policy that is legitimately `public` is not
    // the one a reader has to guess about.
    const publicPolicies = plainRows(rows).filter((r) =>
      r.roles.includes('public'),
    );
    expect(publicPolicies).toHaveLength(1);
    expect(publicPolicies[0]?.policyname).toBe(
      'Anyone can view non-hidden reviews',
    );
    expect(publicPolicies[0]?.cmd).toBe('SELECT');
  });
});

describe('the two things the reviews grant does not stop', () => {
  /**
   * ─── WHAT IT CONCLUDED BEFORE ─────────────────────────────────────────────
   *
   * The severe finding in this file, and the one that needed nothing but the
   * public anon key: a consumer could post a review for a business it never
   * bought from, because `Users can insert own reviews` was
   * `WITH CHECK (user_id = auth.uid())` and that was the whole check. There was
   * no `EXISTS` against `orders`, so "you reviewed a place you went to" was not
   * expressed anywhere in the database — not in a policy, not in a CHECK, not in
   * a trigger.
   *
   * It was cheap to exploit. `reviews_user_id_order_id_key` is
   * `UNIQUE (user_id, order_id)`, `order_id` is NULLABLE, and a UNIQUE
   * constraint does not treat NULLs as equal to each other — so a consumer could
   * insert unlimited reviews against ANY `business_id` by leaving `order_id`
   * NULL, and each one was a distinct row. Measured: 2 rows, 0 distinct orders,
   * a business nobody had bought from sitting at `review_count` 2 with its
   * average dragged to 0.00, and both rows public immediately.
   *
   * ─── WHAT IT CONCLUDES NOW ─────────────────────────────────────────────────
   *
   * Closed, by the same policy, on two conditions at once: `order_id IS NOT
   * NULL`, and an `EXISTS` requiring the order to be the caller's own and to
   * belong to the `business_id` being reviewed
   * (`20260928192000_close_reviews_insert_and_narrow_policies.sql`).
   *
   * The structural facts that MADE the hole are kept as assertions, and they
   * have to be: the column is still NULLABLE and the constraint is still
   * `UNIQUE (user_id, order_id)`. Both are unchanged by this migration, on
   * purpose — the column is nullable because the foreign key is
   * `ON DELETE SET NULL` and historical rows depend on that. What changed is
   * that neither can be used to mint a row any more. A reader who saw only the
   * old conclusion would be looking for a column grant to close this; there is
   * no grant change anywhere in this migration, and there must not be one.
   *
   * The UNIQUE-with-NULLs observation is also the reason the fix is an order
   * check and not a NOT NULL column: a NOT NULL would have been the smaller
   * diff, and it would have failed on every historical row whose order has been
   * deleted, and it would have said nothing about whether the order belongs to
   * the caller.
   */
  test('a consumer can no longer review a business it never bought from, and the UNIQUE constraint never bounded it', async () => {
    // Both structural facts, asserted first because they are what the fix has
    // to work AROUND rather than what it changed. The UNIQUE constraint looks
    // like it would stop a NULL-order flood and does not; the column is nullable
    // and stays nullable.
    const constraints = await ctx.sql.unsafe<
      { conname: string; def: string }[]
    >(
      `select conname, pg_get_constraintdef(oid) as def
         from pg_constraint
        where conrelid = 'public.reviews'::regclass
          and contype in ('u', 'c')
        order by conname`,
    );
    const unique = plainRows(constraints).find(
      (c) => c.conname === 'reviews_user_id_order_id_key',
    );
    expect(unique?.def).toBe('UNIQUE (user_id, order_id)');

    const orderIdColumn = await ctx.sql.unsafe<{ is_nullable: string }[]>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'reviews'
          and column_name = 'order_id'`,
    );
    expect(
      plainRows(orderIdColumn)[0]?.is_nullable,
      'reviews.order_id became NOT NULL. That is not what this migration did ' +
        'and it would be a different design: the column is nullable because ' +
        'the foreign key is ON DELETE SET NULL, and historical rows whose ' +
        'order was deleted depend on it. If this ever does become NOT NULL, ' +
        'say so deliberately and update the migration header.',
    ).toBe('YES');

    const before = await reviewCount();

    // A review for `BIZ_B`, which this consumer never bought from, and with no
    // `order_id` at all — the exact statement that used to succeed.
    const forged = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_B}', 1, 'RLS never bought here') returning id`,
      ),
    );
    expect(
      forged,
      'a consumer could post a review for a business it never bought from. ' +
        'The WITH CHECK now requires an order belonging to the caller, and ' +
        'there is no column grant or trigger that could be the thing refusing ' +
        'it — this is the policy, and if this fails the policy moved.',
    ).not.toBeNull();
    expect(forged?.code).toBe('42501');
    expect(forged?.message).toContain(
      'new row violates row-level security policy',
    );

    // A second one would have been a distinct row too, and is refused the same
    // way — asserted separately because "the first was refused" and "a flood is
    // refused" are different claims, and the second is the one that was the
    // actual primitive.
    const second = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_B}', 1, 'RLS never bought here either') returning id`,
      ),
    );
    expect(
      second,
      'a second NULL-order_id review was accepted. UNIQUE (user_id, order_id) ' +
        'does not treat NULLs as equal, so before the policy change this was a ' +
        'distinct row every time and a flood was one loop.',
    ).not.toBeNull();

    // The measurement that used to BE the finding: two rows, ZERO distinct
    // orders. Now zero of both, and the ratio is asserted as a ratio so a
    // partial fix — one that stops the second insert but not the first — cannot
    // pass.
    const planted = await ctx.sql.unsafe<
      { c: number; distinct_orders: number }[]
    >(
      `select count(*)::int as c, count(distinct order_id)::int as distinct_orders
         from public.reviews
        where business_id = '${BIZ_B}' and user_id = '${MEMBER}'`,
    );
    expect(plainRows(planted)).toEqual([{ c: 0, distinct_orders: 0 }]);

    // The aggregate consequence, which is the one that made this severe. BIZ_B
    // was driven to `review_count` 2 and `rating` 0.00 by reviews of a
    // relationship that never existed, because `on_review_change` fires
    // `update_business_rating()` on INSERT and both filters exclude nothing a
    // client supplied. It is back at zero, and the seeded business is untouched.
    //
    // Read as a pair, not as one string: "the aggregate did not change" would
    // also be true if the plants had never reached the aggregate at all, and
    // that is a different (and harmless) world.
    const aggregate = await ctx.sql.unsafe<
      { id: string; rating: string; review_count: number }[]
    >(`select id, rating, review_count from public.businesses order by id`);
    expect(plainRows(aggregate)).toEqual([
      { id: BIZ_A, rating: '4.50', review_count: 2 },
      { id: BIZ_B, rating: '0.00', review_count: 0 },
    ]);

    // And nothing is public, which is what makes it reputation rather than a
    // moderation queue. Anon can still READ the public feed — that policy is
    // deliberately still `TO public` — it just has nothing new to read.
    const inFeed = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ comment: string }[]>(
          `select comment from public.reviews
            where business_id = '${BIZ_B}' and user_id = '${MEMBER}'
            order by comment`,
        )
        .then((rows) => rows.map((r) => r.comment)),
    );
    expect(
      inFeed,
      'the anonymous feed is showing reviews this consumer planted. The SELECT ' +
        'policy is TO public on purpose — this is the feed working, not a hole ' +
        '— so an empty result here means the ROWS are gone, not the read.',
    ).toEqual([]);

    // Nothing was written, so there is nothing to clean up. Asserted rather than
    // assumed: `deniedAs` COMMITS on the success path, so if either insert had
    // gone through, a silent `finally` here would leave planted reviews behind
    // for the rest of the file to measure.
    expect(await reviewCount()).toBe(before);
    const residual = await ctx.sql.unsafe<{ c: number }[]>(
      `select count(*)::int as c from public.reviews
        where comment in ('RLS never bought here', 'RLS never bought here either')`,
    );
    expect(
      plainRows(residual)[0]?.c,
      'a probe row survived a refused insert. The two statements above report ' +
        '42501, so this means something else created it.',
    ).toBe(0);
  });

  /**
   * The composition this file used to end on, inverted: `anon` cannot TRUNCATE,
   * so there is nothing left for the INSERT policy to be composed with.
   *
   * ─── WHAT IT CONCLUDED BEFORE ───────────────────────────────────────────────
   *
   * The name was `anon can truncate and then re-seed a table it was just denied
   * writes to`, and it was the sharpest sentence in the file. Two findings
   * compose: TRUNCATE is a table-level grant no policy touches, and the INSERT
   * `WITH CHECK` is a predicate on `user_id`. `anon` could empty `reviews` and
   * then still be refused an insert into it by the same policy. The conclusion
   * was that there is no statement a client cannot make about this table.
   *
   * ─── WHAT IT CONCLUDES NOW ─────────────────────────────────────────────────
   *
   * `20260928181714_revoke_client_destructive_privileges.sql` took TRUNCATE away,
   * so the first half is now `42501 permission denied for table reviews`. The
   * composition no longer exists and cannot be re-created from the client side.
   *
   * The second half is KEPT, unchanged and still asserted, because it was never
   * the half that was broken: the no-claim INSERT is still refused by the policy
   * with the same message. Keeping it matters more now, not less — a reader who
   * saw only "TRUNCATE is refused" would reasonably conclude that this table is
   * closed to `anon`, and it is not. `anon` still holds SELECT, INSERT and
   * DELETE. What changed is that one statement no longer empties it.
   *
   * The order is still the point: the attempted TRUNCATE happens first, and the
   * insert is attempted afterwards, so the reader can see that a failed TRUNCATE
   * leaves the policy exactly as it was.
   */
  test('anon cannot truncate reviews, and the INSERT policy refuses it exactly as it did before', async () => {
    const before = await reviewCount();
    expect(before, 'the fixture is not in its seeded state').toBe(2);

    const truncated = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`truncate public.reviews`),
    );
    expect(
      truncated,
      'anon was NOT refused TRUNCATE on reviews. This is the same statement ' +
        'the previous version of this test ran successfully.',
    ).not.toBeNull();
    expect(truncated?.code).toBe('42501');
    expect(
      truncated?.message,
      'the refusal came from somewhere other than the table ACL, so this ' +
        'assertion is measuring the wrong layer',
    ).toContain('permission denied for table reviews');
    expect(await reviewCount()).toBe(2);

    // The insert is still refused, and refused by the same policy with the same
    // message. The table being untouched changes nothing about the check, and
    // this arm is the reason the test survives the inversion: it is the half
    // that documents what `anon` STILL cannot do on this table.
    const refused = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_A}', 5, 'RLS anon after truncate')`,
      ),
    );
    expect(
      refused,
      'anon inserted into reviews with no claim. The WITH CHECK is ' +
        'unchanged, so this means `user_id = auth.uid()` stopped being the ' +
        'gate.',
    ).not.toBeNull();
    expect(refused?.message).toContain(
      'new row violates row-level security policy',
    );
    expect(
      await reviewCount(),
      'the refused INSERT still left a row behind. `deniedAs` COMMITS when the ' +
        'statement SUCCEEDS, so a policy refusal rolls back but a successful ' +
        'write would not — and the count is what says which happened.',
    ).toBe(2);

    // Nothing needed cleaning up, and that is asserted rather than assumed. The
    // previous version of this test had to re-seed both rows in a `finally`
    // because the TRUNCATE had genuinely destroyed them; a leaked probe row here
    // would put every count assertion in the rest of the file off by one with
    // nothing pointing at the cause.
    const rows = await ctx.sql.unsafe<{ id: string; comment: string }[]>(
      `select id, comment from public.reviews order by id`,
    );
    expect(plainRows(rows).map((r) => r.id)).toEqual([REVIEW.M, REVIEW.S]);
    expect(
      plainRows(rows).map((r) => r.comment),
      'the INSERT probe was refused by the policy and yet a row carrying its ' +
        'comment exists. Either the policy let it through or a `deniedAs` ' +
        'success committed something this test believes was rolled back.',
    ).not.toContain('RLS anon after truncate');

    const restored = await ctx.sql.unsafe<
      { id: string; rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(restored)).toEqual([{ rating: '4.50', review_count: 2 }]);
  });
});

/**
 * `20260928192000_close_reviews_insert_and_narrow_policies.sql`, measured on
 * its own terms.
 *
 * ─── WHY A NEW BLOCK AND NOT MORE TESTS IN THE EXISTING ONES ─────────────────
 *
 * Every test in the blocks above concluded something that the migration
 * inverted, so none of them could be extended — each was rewritten to state the
 * new conclusion and keep the old one visible. What is left is a different kind
 * of test: not "what did this hole look like" but "does the thing the mobile
 * actually does still work, and what exactly is the boundary now". Those are
 * positive assertions against a policy that has to be RIGHT, and mixing them
 * into the inverted blocks would have buried them under before/after prose.
 *
 * The file is long, and the fixture is the reason it stays one file. Seeding
 * means three Vault secrets, five `auth.users` rows, a role promotion, two
 * businesses with hand-written `business_ownership`, a location, two offers and
 * four orders, and it is all coupled: `auth_helpers.my_role()` reads `profiles`,
 * `trg_bootstrap_business_companions` only fires with a JWT, and
 * `on_order_status_change` raises without the Vault rows. Duplicating that to
 * satisfy a line count would buy a shorter file and a second place for the
 * fixture to drift. Split when the SEED can be split, not when the line count
 * is uncomfortable.
 */
describe('the reviews insert, after 20260928192000', () => {
  /**
   * The one that matters most, and it is first for that reason.
   *
   * Every other test in this block asserts a refusal. A suite of refusals
   * passes just as happily against a policy that refuses everything, so the
   * positive arm is not decoration — it is the only thing that distinguishes a
   * boundary from a wall.
   *
   * This is the exact statement `submitReview` issues
   * (`apps/mobile/src/features/orders/data/repository.ts`), and the exact shape
   * `ReviewsService.create` writes: the consumer's own order, the business that
   * order belongs to, the two ratings and the comment. Nothing here is a
   * weakened variant to make it pass — `business_id` is taken from the order,
   * because that is what the client does and what the API does.
   *
   * On the "201": the database does not return status codes, and this is the
   * layer beneath that number. `POST /reviews` is `@ApiCreatedResponse` and
   * returns 201 when this insert is accepted, and `ReviewsService.create` runs
   * the two checks that are STRICTER than the policy — the order must belong to
   * the caller, and its status must be `completed`
   * (`apps/api/src/modules/reviews/reviews.service.db.spec.ts` covers both, the
   * second as `Forbidden`/`BadRequest`). The mobile does not go through that
   * service at all; it writes to PostgREST directly, which is why the rule has
   * to be here as well as there.
   *
   * The status gap is worth naming because it is real and this migration did not
   * close it: the API refuses a non-completed order, the mobile does not check
   * status, and the database has never expressed it. Adding
   * `o.status = 'completed'` to the EXISTS would be a product decision taken
   * inside a security migration — the mobile's review screen is reachable from
   * an order detail page whatever the status — so it is reported in the
   * migration header and left alone.
   */
  test('the order owner reviewing their own order at its own business still works', async () => {
    const before = await reviewCount();
    const aggregateBefore = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(aggregateBefore)).toEqual([
      { rating: '4.50', review_count: 2 },
    ]);

    // `deniedAs` hands back `null` on SUCCESS, so this is the shape of the
    // assertions throughout: a null here is a 201 at the layer above.
    const inserted = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, product_rating, business_rating, comment)
         values ('${MEMBER}', '${BIZ_A}', '${ORDER.Q}', 4, 3, 'RLS the legitimate path')
         returning id, user_id::text, business_id::text, order_id::text,
                   product_rating, business_rating, comment, is_hidden, moderated_by::text`,
      ),
    );
    expect(
      inserted,
      'the legitimate review was REFUSED. This is the test that stops the fix ' +
        'from being a break: `submitReview` declares orderId as required and ' +
        'passes the business read off the same order row, so if the policy ' +
        'rejects this, the mobile review flow is broken in production. Check ' +
        'the EXISTS before anything else.',
    ).toBeNull();

    // Re-read as the owner rather than through the client session, so the
    // values are the row's own and not a projection through the SELECT policy.
    const landed = await ctx.sql.unsafe<
      {
        user_id: string;
        business_id: string;
        order_id: string;
        product_rating: number;
        business_rating: number;
        comment: string;
        is_hidden: boolean;
        moderated_by: string | null;
      }[]
    >(
      `select user_id::text, business_id::text, order_id::text, product_rating,
              business_rating, comment, is_hidden, moderated_by::text
         from public.reviews
        where comment = 'RLS the legitimate path'`,
    );
    expect(
      plainRows(landed),
      'the row did not land with the values that were sent. The policy is a ' +
        'WITH CHECK, so it can only refuse — it cannot rewrite — and anything ' +
        'different here is the trigger or a column default.',
    ).toEqual([
      {
        user_id: MEMBER,
        business_id: BIZ_A,
        order_id: ORDER.Q,
        product_rating: 4,
        business_rating: 3,
        comment: 'RLS the legitimate path',
        // Unmoderated, because the row is new. Asserted as values rather than
        // omitted: "the moderation columns are fine" is exactly the claim that
        // was false before this migration, and it is cheap to keep true.
        is_hidden: false,
        moderated_by: null,
      },
    ]);

    // The aggregate MOVED, which is the half that says this is a real review
    // and not a row that satisfies a predicate. `business_rating` 3 joins the
    // seeded 5 and 4: avg = 4.00 over three reviews.
    const aggregateAfter = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(aggregateAfter)).toEqual([
      { rating: '4.00', review_count: 3 },
    ]);

    // It is in the public feed with no token, because the SELECT policy is
    // deliberately still `TO public` and the two `@Public()` routes depend on
    // it. Asserted so a future narrowing of THAT policy fails here, where the
    // reason is written down, rather than in a product bug report.
    const inAnonFeed = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ comment: string }[]>(
          `select comment from public.reviews where comment = 'RLS the legitimate path'`,
        )
        .then((rows) => rows.map((r) => r.comment)),
    );
    expect(
      inAnonFeed,
      'the legitimate review is not readable by anon. The SELECT policy is ' +
        'intentionally TO public — it is the public review feed behind two ' +
        '@Public() routes — so this failing means the FEED was narrowed.',
    ).toEqual(['RLS the legitimate path']);

    try {
      // A second review on the SAME order is still refused, and that is a
      // different layer from everything above: `UNIQUE (user_id, order_id)`, a
      // constraint, not a policy. Asserted because the mobile writes with
      // `upsert(… onConflict: 'user_id,order_id')`, so this is the exact
      // statement shape the edit path depends on, and the distinction matters
      // for anyone who later reads the refusal as "the policy got stricter".
      const duplicate = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.reviews
               (user_id, business_id, order_id, product_rating, business_rating, comment)
             values ('${MEMBER}', '${BIZ_A}', '${ORDER.Q}', 1, 1, 'RLS duplicate on the same order')`,
        ),
      );
      expect(duplicate?.code).toBe('23505');
    } finally {
      await ctx.sql
        .unsafe(
          `delete from public.reviews where comment = 'RLS the legitimate path'`,
        )
        .catch(() => {});
    }

    // The AFTER DELETE trigger recomputes, so the aggregate is back without this
    // test writing it. Asserted because a leaked row here makes every count
    // assertion in the file that runs after it pass for the wrong reason.
    expect(await reviewCount()).toBe(before);
    const restored = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
    );
    expect(plainRows(restored)).toEqual([{ rating: '4.50', review_count: 2 }]);
  });

  /**
   * The NULL-order arm on its own, separate from the flood test in the block
   * above, because the two are refused for different reasons and a reader
   * debugging a production rejection will be told one of them.
   *
   * The honest detail: `order_id IS NOT NULL` is NOT what refuses this. The
   * `EXISTS` alone would, because `o.id = NULL` is never true. The explicit
   * term is in the policy to name the invariant rather than to rely on that
   * accident — and relying on an accident of NULL comparison is precisely what
   * made the four `TO public` policies look defended.
   *
   * Measured, not assumed. Deleting the `IS NOT NULL` term from the policy
   * leaves this test and every other behavioural test in this file green; the
   * only assertion that notices is the `toContain('order_id IS NOT NULL')` on
   * the catalog text in `the anon insert` above. That is a guard against
   * someone deleting the term on purpose, and it is NOT evidence that the term
   * stops a NULL insert. Loosening the EXISTS to "the caller owns SOME order"
   * is a different mutation, and that one this test DOES catch.
   *
   * So the assertion below is about the OUTCOME, and the message says which
   * layer to look at, rather than claiming the term is load-bearing.
   */
  test('a client cannot insert a review with a NULL order_id, for any business', async () => {
    const before = await reviewCount();

    for (const [businessId, why] of [
      [BIZ_A, 'a business this consumer has actually bought from'],
      [BIZ_B, 'a business it has not'],
    ] as const) {
      const refused = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.reviews
             (user_id, business_id, rating, comment)
           values ('${MEMBER}', '${businessId}', 1, 'RLS null order at ${businessId}')
           returning id`,
        ),
      );
      expect(
        refused,
        `a review with a NULL order_id was accepted against ${why}. Before ` +
          '20260928192000 this was the unlimited-review primitive: ' +
          'UNIQUE (user_id, order_id) never treats NULLs as equal, so every ' +
          'one of these was a distinct row.',
      ).not.toBeNull();
      expect(refused?.code).toBe('42501');
      expect(refused?.message).toContain(
        'new row violates row-level security policy',
      );
    }

    expect(
      await reviewCount(),
      'a NULL-order_id probe row survived a refused insert. `deniedAs` COMMITS ' +
        'on the success path, so a silently committed row would outlive this ' +
        'test and shift every count after it.',
    ).toBe(before);
  });

  /**
   * Somebody else's order.
   *
   * This is the arm the NULL test cannot cover and the reason the fix is an
   * `EXISTS` rather than a NOT NULL: a NOT NULL column would refuse every NULL
   * review and every real one would still pass, including a review written
   * against another consumer's order. The order has to be checked for OWNERSHIP
   * or the check is only a shape.
   *
   * Two things are asserted that a reader should not skip. First, the order is
   * real and belongs to STRANGER, so the refusal is not a missing-fixture
   * accident. Second, the negative assertion on `violates foreign key
   * constraint`: STRANGER is an `auth.users` row and a `profiles` row, so if the
   * policy were not the thing refusing, the error would say FK — the same guard
   * `orders.rls.db.spec.ts` uses.
   */
  test('a client cannot insert a review against another consumer’s order', async () => {
    const before = await reviewCount();

    // The order is real and is not this consumer's. Read as the owner so the
    // fixture, not the policy, is what is being checked.
    const order = await ctx.sql.unsafe<
      { id: string; user_id: string; business_id: string }[]
    >(`select id::text, user_id::text, business_id::text
         from public.orders where id = '${ORDER.S}'`);
    expect(plainRows(order)).toEqual([
      { id: ORDER.S, user_id: STRANGER, business_id: BIZ_A },
    ]);

    // Note the `business_id` is CORRECT here: this is STRANGER's order at
    // BIZ_A and the review names BIZ_A. The only thing wrong with the statement
    // is whose order it is, which is the arm under test.
    const refused = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
         values ('${MEMBER}', '${BIZ_A}', '${ORDER.S}', 1, 1, 1, 'RLS somebody else order')
         returning id`,
      ),
    );
    expect(
      refused,
      'a consumer wrote a review on another consumer’s order. The EXISTS ' +
        'requires o.user_id = reviews.user_id, and user_id is already pinned ' +
        'to the caller, so this can only mean the order half of the check is ' +
        'gone.',
    ).not.toBeNull();
    expect(refused?.code).toBe('42501');
    expect(refused?.message).toContain(
      'new row violates row-level security policy',
    );
    expect(
      refused?.message,
      'the refusal came from a foreign key or a CHECK rather than from the ' +
        'policy. STRANGER has a real profile row in this fixture, so an FK ' +
        'error would mean a different statement than the one above.',
    ).not.toContain('violates foreign key constraint');

    expect(await reviewCount()).toBe(before);
  });

  /**
   * The right order, the wrong business.
   *
   * The other arm the ownership check does not cover on its own, and the reason
   * the EXISTS compares `o.business_id` as well as `o.user_id`. Without that
   * comparison a consumer holding a real order at BIZ_A can post a review
   * against BIZ_B, and the row is attributed to an order that has nothing to do
   * with the business being reviewed — which is the same reputation primitive as
   * the NULL-order flood, wearing a valid order as a disguise.
   *
   * Asserted as a pair on purpose: the order is genuinely MEMBER's, and the
   * business is genuinely not the order's. Remove either fact and the test would
   * be measuring a different arm.
   */
  test('a client cannot insert a review whose business is not the order’s business', async () => {
    const before = await reviewCount();

    const order = await ctx.sql.unsafe<
      { user_id: string; business_id: string }[]
    >(
      `select user_id::text, business_id::text
         from public.orders where id = '${ORDER.R}'`,
    );
    expect(
      plainRows(order),
      'ORDER.R stopped being MEMBER’s order at BIZ_A, so this test is no ' +
        'longer measuring a business mismatch — it would be measuring a ' +
        'missing fixture.',
    ).toEqual([{ user_id: MEMBER, business_id: BIZ_A }]);

    // A real order of this consumer, on a business the order does not belong to.
    const refused = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews
           (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
         values ('${MEMBER}', '${BIZ_B}', '${ORDER.R}', 1, 1, 1, 'RLS wrong business')
         returning id`,
      ),
    );
    expect(
      refused,
      'a consumer reviewed a business its order does not belong to, using a ' +
        'real order of its own. This is the arm that survives a fix which only ' +
        'checked ownership: o.business_id = reviews.business_id is the ' +
        'comparison doing this, and it is a separate term.',
    ).not.toBeNull();
    expect(refused?.code).toBe('42501');
    expect(refused?.message).toContain(
      'new row violates row-level security policy',
    );

    // And BIZ_B's aggregate is untouched, which is where the consequence lived.
    const aggregate = await ctx.sql.unsafe<
      { id: string; rating: string; review_count: number }[]
    >(`select id, rating, review_count from public.businesses order by id`);
    expect(plainRows(aggregate)).toEqual([
      { id: BIZ_A, rating: '4.50', review_count: 2 },
      { id: BIZ_B, rating: '0.00', review_count: 0 },
    ]);

    expect(await reviewCount()).toBe(before);
  });

  /**
   * `anon` is outside all three write policies, and the read surface it is
   * legitimately inside still works.
   *
   * Two halves, and the second is the one that would be easy to break. The first
   * is the narrowing: the roles in `pg_policies` are the assertion, because
   * "anon cannot write" and "anon is not in the policy" are different claims and
   * only the second is what the migration did. `anon` still HOLDS the INSERT and
   * DELETE grants — that is unchanged and asserted elsewhere in this file — so
   * the boundary here is the policy and nothing else. If the grants were revoked
   * instead, every refusal in this block would still pass while describing a
   * different layer.
   *
   * The second half is the SELECT policy, which stayed `TO public` on purpose.
   * It is asserted with a real anonymous read of a real review, because the
   * failure mode of narrowing it is not a test failure — it is an empty
   * `GET /businesses/public/:id/reviews` in production, and no assertion about
   * refusals would ever have caught it.
   */
  test('anon is outside the three write policies, and the public review feed is still readable without a token', async () => {
    const policyRows = await ctx.sql.unsafe<
      { policyname: string; cmd: string; roles: string[] }[]
    >(`select policyname, cmd, roles
         from pg_policies
        where schemaname = 'public' and tablename = 'reviews'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')
        order by cmd`);
    expect(
      plainRows(policyRows),
      'a write policy on reviews is not TO authenticated. Every one of them ' +
        'was TO public before 20260928192000, and the whole point of that ' +
        'migration was that the role should decide.',
    ).toEqual([
      {
        policyname: 'Users can delete own reviews',
        cmd: 'DELETE',
        roles: ['authenticated'],
      },
      {
        policyname: 'Users can insert own reviews',
        cmd: 'INSERT',
        roles: ['authenticated'],
      },
      {
        policyname: 'Users can update own reviews',
        cmd: 'UPDATE',
        roles: ['authenticated'],
      },
    ]);

    // The layer, stated so a reader is not misled into thinking the grant moved:
    // `anon` still holds INSERT and DELETE on this table, and the statements are
    // still refused by RLS rather than by `42501 permission denied`.
    for (const [role, claim] of [
      ['anon', null],
      ['anon', MEMBER],
    ] as const) {
      const insertRefusal = await deniedAs(ctx.sql, role, claim, (tx) =>
        tx.unsafe(
          `insert into public.reviews
             (user_id, business_id, order_id, rating, product_rating, business_rating, comment)
           values ('${MEMBER}', '${BIZ_A}', '${ORDER.Q}', 1, 1, 1, 'RLS anon after narrowing')`,
        ),
      );
      expect(insertRefusal?.code).toBe('42501');
      expect(insertRefusal?.message).toContain(
        'new row violates row-level security policy',
      );
    }
    const deleteRefusal = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(`delete from public.reviews where true`),
    );
    expect(
      deleteRefusal,
      'anon with a claim raised on delete. A DELETE policy that matches no ' +
        'role is a silent zero-row match, not an error.',
    ).toBeNull();
    expect(await reviewCount()).toBe(2);

    // ─── THE READ, which is the half that matters for the product ───────────
    //
    // `GET /businesses/public/:id/reviews` and `GET /offers/:id/reviews` are
    // both `@Public()` in `reviews-feeds.controller.ts`, so the mobile's
    // business page and offer page read reviews with no token at all. The
    // policy's first branch, `is_hidden IS NOT TRUE`, is what serves them.
    //
    // Both branches are asserted: a visible review is readable by anon, and a
    // hidden one is not. The second is the part a naive `TO public` narrowing
    // would have broken in the other direction — `20260927021015` dropped the
    // `to` clause deliberately for exactly this reason, and reversing a
    // documented decision inside a security migration is how a read regression
    // gets shipped as a fix.
    const visible = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ comment: string }[]>(
          `select comment from public.reviews
            where business_id = '${BIZ_A}' and is_hidden is not true
            order by comment`,
        )
        .then((rows) => rows.map((r) => r.comment)),
    );
    expect(
      visible,
      'anon cannot read the public review feed. The SELECT policy is ' +
        'intentionally TO public and this is what that buys.',
    ).toEqual(['RLS review mine', 'RLS review stranger']);

    // Hide one as the service role — the same path the API's moderation uses —
    // and confirm anon loses it while the author keeps it.
    await ctx.sql.unsafe(
      `update public.reviews set is_hidden = true, moderation_reason = 'other',
              hidden_reason = 'pinned by the anon read test', moderated_at = now(),
              moderated_by = '${ADMIN}'
         where id = '${REVIEW.S}'`,
    );
    try {
      const afterHide = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews
              where business_id = '${BIZ_A}' and is_hidden is not true
              order by comment`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      );
      expect(afterHide).toEqual(['RLS review mine']);

      const authorStillReads = await as(
        ctx.sql,
        'authenticated',
        STRANGER,
        (tx) =>
          tx
            .unsafe<{ comment: string }[]>(
              `select comment from public.reviews where id = '${REVIEW.S}'`,
            )
            .then((rows) => rows.map((r) => r.comment)),
      );
      expect(
        authorStillReads,
        "an author can no longer read their own hidden review. The policy's " +
          'second branch is `or user_id = auth.uid()`, and that branch is the ' +
          'reason the policy is a disjunction rather than a single predicate.',
      ).toEqual(['RLS review stranger']);
    } finally {
      // Unconditional: `ctx.sql` is the owner, so this cannot be refused, and a
      // hidden REVIEW.S would make the soft-hide block above measure the wrong
      // starting state.
      await ctx.sql.unsafe(
        `update public.reviews set is_hidden = false, moderation_reason = null,
                hidden_reason = null, moderated_at = null, moderated_by = null
           where id = '${REVIEW.S}'`,
      );
    }
    expect(
      await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews where id = '${REVIEW.S}'`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      ),
      'REVIEW.S was not restored to visible, so the soft-hide tests above are ' +
        'measuring a table that starts with one review already hidden.',
    ).toEqual(['RLS review stranger']);
  });

  /**
   * The migration's "no-op on existing data" claim, measured rather than
   * asserted in a comment.
   *
   * RLS is evaluated at write time and never retroactively, so a row written
   * before this migration keeps whatever it holds — including a NULL
   * `order_id`, which the new policy would refuse on any new write. Production
   * has such rows: the foreign key is `ON DELETE SET NULL`, so deleting an
   * order nulls `order_id` on reviews written years ago. "The policy now
   * requires an order" is therefore not the same claim as "every review has an
   * order", and only this test tells the two apart.
   *
   * The row is planted AS THE OWNER, which is exactly how a pre-migration row
   * looks: no policy applies, because the owner is not subject to RLS. The
   * BEFORE INSERT trigger does fire for it, and correctly changes nothing —
   * `is_hidden` is already the column default — so this doubles as evidence
   * that the trigger is invisible to anything that was already true.
   *
   * `UNIQUE (user_id, order_id)` does not block a NULL `order_id` a second
   * time, which is the whole reason the historical rows could accumulate. The
   * second insert is what proves the constraint is still NULL-tolerant — and
   * therefore that the new policy, not the constraint, is what closes the door.
   */
  test('a row written before the migration with a NULL order_id is still readable and still deletable', async () => {
    const before = await reviewCount();
    const aggregateBefore = await ctx.sql.unsafe<
      { rating: string; review_count: number }[]
    >(
      `select rating, review_count from public.businesses where id = '${BIZ_B}'`,
    );
    expect(plainRows(aggregateBefore)).toEqual([
      { rating: '0.00', review_count: 0 },
    ]);

    try {
      // Two legacy rows, planted as the owner, exactly as a pair written before
      // 20260928192000 would look: NULL order_id, no relationship to BIZ_B.
      await ctx.sql.unsafe(`
        insert into public.reviews (user_id, business_id, rating, comment)
        values ('${MEMBER}', '${BIZ_B}', 1, 'RLS legacy row one'),
               ('${MEMBER}', '${BIZ_B}', 1, 'RLS legacy row two')
      `);
      expect(
        await reviewCount(),
        'the legacy rows did not land, so everything below would be vacuous.',
      ).toBe(before + 2);

      // The structural fact that let them accumulate, still true.
      const legacy = await ctx.sql.unsafe<
        { c: number; distinct_orders: number }[]
      >(
        `select count(*)::int as c, count(distinct order_id)::int as distinct_orders
           from public.reviews where business_id = '${BIZ_B}' and user_id = '${MEMBER}'`,
      );
      expect(plainRows(legacy)).toEqual([{ c: 2, distinct_orders: 0 }]);

      // READ: the author still sees them, and so does anon, because the SELECT
      // policy has no order requirement. RLS did not start re-evaluating old
      // rows the day the policy changed, and that is the point.
      const byAnon = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews where comment like 'RLS legacy row%' order by comment`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      );
      expect(
        byAnon,
        'a pre-existing NULL-order_id review became unreadable. The new ' +
          'policy governs NEW writes; if this fails, something is re-checking ' +
          'rows that already exist.',
      ).toEqual(['RLS legacy row one', 'RLS legacy row two']);

      // DELETE: the author can still remove its own row, which is the other
      // thing the old policy granted and the new one must not have taken away.
      const removed = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `delete from public.reviews where comment = 'RLS legacy row one' returning id`,
        ),
      );
      expect(
        removed,
        'the author could not delete its own review. The DELETE policy is ' +
          'unchanged apart from its role, and this row is a legitimate own-row ' +
          'delete — if this fails, the narrowing went too far.',
      ).toBeNull();

      // The second row survives, so the delete was scoped by the policy and not
      // by the table emptying itself.
      expect(
        await as(ctx.sql, 'anon', null, (tx) =>
          tx
            .unsafe<{ comment: string }[]>(
              `select comment from public.reviews where comment like 'RLS legacy row%' order by comment`,
            )
            .then((rows) => rows.map((r) => r.comment)),
        ),
      ).toEqual(['RLS legacy row two']);

      // A NEW NULL-order_id review is still refused, on the same table, in the
      // same test. Old rows and new writes are governed by different things and
      // the only way to show that is to put them side by side.
      const newRow = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.reviews (user_id, business_id, rating, comment)
           values ('${MEMBER}', '${BIZ_B}', 1, 'RLS new row, not legacy') returning id`,
        ),
      );
      expect(
        newRow,
        'a NEW NULL-order_id review was accepted next to two legacy ones. The ' +
          'policy is the gate and it applies to writes, not to rows.',
      ).not.toBeNull();
      expect(newRow?.code).toBe('42501');
    } finally {
      // Unconditional, and `.catch()`-free on purpose: this runs as the owner,
      // nothing references `reviews`, and a throwing cleanup at the end of a
      // `finally` is indistinguishable from a finding.
      await ctx.sql.unsafe(
        `delete from public.reviews where comment like 'RLS legacy row%'
            or comment = 'RLS new row, not legacy'`,
      );
    }

    // BIZ_B's aggregate is back to zero, recomputed by the AFTER DELETE trigger.
    expect(await reviewCount()).toBe(before);
    const restored = await ctx.sql.unsafe<
      { id: string; rating: string; review_count: number }[]
    >(`select id, rating, review_count from public.businesses order by id`);
    expect(plainRows(restored)).toEqual([
      { id: BIZ_A, rating: '4.50', review_count: 2 },
      { id: BIZ_B, rating: '0.00', review_count: 0 },
    ]);
  });

  /**
   * The trigger is INSERT-only, and moderation is still an UPDATE.
   *
   * This is the assertion that keeps the previous describe block honest. The
   * reset function forces `is_hidden := false` on every insert with no
   * condition on the caller, which is sound only because nothing legitimately
   * inserts a hidden review — so the thing that has to be true is that hiding a
   * review is still an UPDATE, and still works.
   *
   * The role here is `service_role`, and that is the honest detail rather than a
   * convenience: `authenticated` holds a column UPDATE grant on four columns
   * and `is_hidden` is not one of them, so the admin panel cannot hide a review
   * by talking to Postgres as an admin. It does it through the API, which
   * connects with the service role and bypasses RLS
   * (`ReviewsModerationService.applyModeration` → `setHidden`, an UPDATE).
   * Neither of those changed here, and neither is described as a boundary: the
   * column grant is a convention, the service role is a privilege.
   */
  test('hiding a review is still an UPDATE, and the BEFORE INSERT trigger does not touch it', async () => {
    const triggerDef = await ctx.sql.unsafe<{ def: string }[]>(
      // `oid` is qualified because `pg_trigger`, `pg_class` and
      // `pg_namespace` all carry one, and an unqualified reference is a 42702
      // that reads like a broken test rather than a broken query.
      `select pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'reviews'
          and t.tgname = 'trg_reviews_unmoderated_on_insert' and not t.tgisinternal`,
    );
    expect(
      plainRows(triggerDef)[0]?.def,
      'the reset trigger is no longer BEFORE INSERT only. If it gained an ' +
        'UPDATE arm it would overwrite every moderation decision the API makes, ' +
        'which is the one way this design could be wrong.',
    ).toContain('BEFORE INSERT ON public.reviews');
    expect(plainRows(triggerDef)[0]?.def).not.toContain('UPDATE');

    // Hide, as the API does.
    const hidden = await deniedAs(ctx.sql, 'service_role', ADMIN, (tx) =>
      tx.unsafe(
        `update public.reviews
            set is_hidden = true, moderation_reason = 'other',
                hidden_reason = 'hidden by the moderation test',
                moderated_at = now(), moderated_by = '${ADMIN}'
          where id = '${REVIEW.S}'
          returning id::text, is_hidden, moderated_by::text`,
      ),
    );
    expect(hidden, 'the service role could not hide a review').toBeNull();

    const landed = await ctx.sql.unsafe<
      { is_hidden: boolean; moderated_by: string; moderation_reason: string }[]
    >(
      `select is_hidden, moderated_by::text, moderation_reason
         from public.reviews where id = '${REVIEW.S}'`,
    );
    expect(plainRows(landed)).toEqual([
      {
        is_hidden: true,
        moderated_by: ADMIN,
        moderation_reason: 'other',
      },
    ]);

    // And unhide, which is the direction no client can reach at all.
    try {
      const unhidden = await deniedAs(ctx.sql, 'service_role', ADMIN, (tx) =>
        tx.unsafe(
          `update public.reviews
              set is_hidden = false
            where id = '${REVIEW.S}'
            returning is_hidden`,
        ),
      );
      expect(unhidden, 'the service role could not unhide a review').toBeNull();
      expect(await reviewCount()).toBe(2);
    } finally {
      await ctx.sql.unsafe(
        `update public.reviews
            set is_hidden = false, moderation_reason = null, hidden_reason = null,
                moderated_at = null, moderated_by = null
          where id = '${REVIEW.S}'`,
      );
    }
    expect(
      await ctx.sql.unsafe<
        { is_hidden: boolean; moderated_by: string | null }[]
      >(
        `select is_hidden, moderated_by::text from public.reviews where id = '${REVIEW.S}'`,
      ),
      'REVIEW.S was not restored, so the soft-hide block above starts from a ' +
        'table with one review already hidden.',
    ).toEqual([{ is_hidden: false, moderated_by: null }]);
  });
});
