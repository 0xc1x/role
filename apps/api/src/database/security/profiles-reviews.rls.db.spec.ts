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
     * Two businesses, two offers, two orders and two reviews.
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
             ('${ORDER.S}', '${STRANGER}', '${OFFER_B}', '${BIZ_A}', 'RLS-PR-S', 'confirmed', 4.00, 10.00, 'PICK-S', 0.4000, 0.4000, 3.2000);

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
   * #1, and the honest answer is "both, and neither of them is a design".
   *
   * The gate for an INSERT is the `WITH CHECK`, and the `USING` is NULL — which
   * is the expected shape for an INSERT, since there is no old row to qualify.
   * Asserted from `pg_policies` rather than assumed, because the two being
   * confused is how a "the policy prevents it" claim gets made about a column
   * that nothing constrains.
   *
   * The real `with_check` is `user_id = auth.uid()`. For an anonymous session
   * `auth.uid()` is NULL, so the comparison is NULL, so the row does not satisfy
   * the check, so the INSERT is refused. The refusal is REAL and it is a POLICY
   * refusal — the message is `new row violates row-level security policy for
   * table "reviews"`, not a grant error, and that distinction is asserted.
   *
   * But the mechanism is a three-valued-logic coincidence, not a design:
   *
   *     '1111…'::uuid = auth.uid()   ->  NULL, not false
   *
   * The policy never says "an anonymous caller may not post". It says "the row's
   * user_id must be the caller's", and with no caller that comparison is
   * undefined. It happens to be safe because a NULL `WITH CHECK` is treated as
   * not-satisfied. Change the predicate to `user_id is not distinct from
   * auth.uid()` — a rewrite that reads as a strictness improvement — and the
   * same anonymous request would be ACCEPTED with `user_id` NULL, except the
   * column is NOT NULL, and then the error would be `23502` instead, and the
   * policy would no longer be the thing protecting anything.
   *
   * So the correct statement of the finding is: the refusal is enforced by the
   * POLICY, and it is enforced by an accident of how NULL compares. Both facts
   * are asserted, and the next test shows the accident has a hole.
   */
  test('the anon insert is refused by the WITH CHECK, and the WITH CHECK reaches it through NULL comparison', async () => {
    // The shape of the INSERT policy, read from the catalog.
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

    expect(plainRows(policy)).toEqual([
      {
        policyname: 'Users can insert own reviews',
        cmd: 'INSERT',
        roles: ['public'],
        qual: null,
        with_check: '(user_id = ( SELECT auth.uid() AS uid))',
      },
    ]);

    // Why `anon` has no `user_id` to satisfy it: the claim is absent, so
    // `auth.uid()` is NULL. Measured, because "it must be NULL" is the whole
    // mechanism and a harness that always set a sub would not see it.
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

    // And the refusal itself: a POLICY error, not a grant error. The negative
    // assertion is the load-bearing half — `anon` DOES hold the INSERT grant, so
    // if the message ever says `permission denied for table reviews` the file
    // would be describing a different database.
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
   * The hole in that accident, and it is not hypothetical.
   *
   * The `WITH CHECK` tests `user_id = auth.uid()`. It does not test that the
   * caller is authenticated. So the ONLY thing standing between an anonymous
   * request and a forged review is whether the request carries a `sub` claim —
   * and a JWT is not required to carry one. The Supabase `anon` key ships with
   * a `sub` of `anonymous`, and any client that presents a JWT whose `sub` is a
   * real user id, signed by the project's own secret, arrives at the same
   * predicate as that user.
   *
   * Measured on this database: `anon` with a sub-claim set to a real user id
   * inserts a review attributed to that user, and the INSERT policy permits it,
   * because the predicate is satisfied. The role is still `anon` — the grant
   * layer is unchanged, the policy is unchanged, and the RLS `WITH CHECK` did
   * exactly what it says.
   *
   * The consequence for the product is concrete: a review is public, it is
   * permanent unless the author deletes it, and `businesses.rating` /
   * `review_count` are derived from it by `on_review_change`. So this is a
   * reputation primitive, and the table's own INSERT policy is what lets it be
   * aimed at somebody else.
   *
   * This is asserted, not asserted-against. The claim "anon cannot forge reviews"
   * is TRUE for a request with no `sub` and FALSE for a request with one, and a
   * spec that only recorded the first half would be the kind of measurement that
   * is right and useless.
   */
  test('anon with a sub-claim forges a review attributed to that user, and the INSERT policy permits it', async () => {
    const before = await reviewCount();

    const landed = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_A}', 1, 'RLS anon forged with a sub') returning id`,
      ),
    );
    expect(
      landed,
      'the anon-with-sub insert was refused. If this now fails, the WITH CHECK ' +
        'is no longer `user_id = auth.uid()` — the accidental protection is ' +
        'real and the accidental hole is closed, and the header is wrong.',
    ).toBeNull();

    // The row is attributed to the member, not to nobody. That is the finding.
    const forged = await ctx.sql.unsafe<
      { user_id: string; comment: string; rating: number }[]
    >(
      `select user_id::text, comment, rating
         from public.reviews
        where comment = 'RLS anon forged with a sub'`,
    );
    expect(plainRows(forged)).toEqual([
      { user_id: MEMBER, comment: 'RLS anon forged with a sub', rating: 1 },
    ]);

    // It is public immediately, because the moderation state defaults to
    // visible and the "Anyone can view non-hidden reviews" policy is
    // `TO public`.
    const visibleToAnon = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ comment: string }[]>(
          `select comment from public.reviews where comment = 'RLS anon forged with a sub'`,
        )
        .then((rows) => rows.map((r) => r.comment)),
    );
    expect(
      visibleToAnon,
      'the forged review is not in the anonymous feed',
    ).toEqual(['RLS anon forged with a sub']);

    // The delete policy is the same predicate, so the victim can remove it —
    // which is the one mitigation this shape has, and it depends on the victim
    // noticing.
    const victimCanClean = await deniedAs(
      ctx.sql,
      'authenticated',
      MEMBER,
      (tx) =>
        tx.unsafe(
          `delete from public.reviews where comment = 'RLS anon forged with a sub'`,
        ),
    );
    expect(
      victimCanClean,
      'the victim cannot delete a review attributed to them, so the forge is ' +
        'permanent',
    ).toBeNull();

    expect(
      await reviewCount(),
      'the forged row was not removed by its own delete policy, so the ' +
        'mitigation assertion above is passing for the wrong reason',
    ).toBe(before);
  });

  /**
   * `anon` with a sub-claim still cannot post as somebody ELSE.
   *
   * The half of the previous test that keeps it from being a total compromise,
   * and it is worth pinning because it is what makes the finding a
   * wrong-attribution hole rather than an open door: the forged row has to name
   * the same id the claim does.
   *
   * A second fixture user exists for exactly this. STRANGER is a real
   * `auth.users` row, so the statement is refused by the POLICY and not by a
   * foreign key — the negative assertion on `violates foreign key constraint` is
   * what proves it, the same guard `orders.rls.db.spec.ts` uses.
   */
  test('anon with a sub-claim can only forge as the user that claim names', async () => {
    const before = await reviewCount();

    const denial = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${STRANGER}', '${BIZ_A}', 1, 'RLS anon forged as somebody else')`,
      ),
    );

    expect(
      denial,
      'anon with a sub-claim for MEMBER posted a review attributed to ' +
        'STRANGER. The WITH CHECK is not doing what the header says it does.',
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

describe('the moderation columns a client can write', () => {
  /**
   * #2, measured: a signed-in client CAN write `is_hidden`, `moderated_by`,
   * `moderated_at`, `moderation_reason` and `hidden_reason` on INSERT, and the
   * row lands with exactly the values it sent.
   *
   * `users: [public]` + `INSERT` on all 15 columns means the moderation surface
   * is inside the INSERT grant. Nothing in the `WITH CHECK` — which is only
   * `user_id = auth.uid()` — looks at any of them, and the two triggers on
   * `reviews` do not overwrite them: `on_review_change` calls
   * `update_business_rating()` and `on_review_offer_change` calls
   * `update_offer_rating()`, and BOTH are `AFTER INSERT OR DELETE OR UPDATE`
   * functions whose entire body is an `update` on `businesses` and `offers`
   * respectively. They derive the AGGREGATE from the review, they never write
   * back to `reviews`. So there is no trigger defence here either.
   *
   * That is the distinction the brief asks for and it is worth stating plainly:
   * a trigger that overwrote the value would be a DIFFERENT defence from a
   * grant that refuses the statement, and neither exists. The only thing that
   * touches a moderation column is a CHECK constraint, and it is the
   * `reviews_moderation_reason_required` one — which requires a reason WHEN
   * HIDING and says nothing about who may hide. A client that hides its own
   * review has to supply a reason, and can invent one.
   *
   * Why this matters in a marketplace: `is_hidden` is the entire moderation
   * switch. It is what `Anyone can view non-hidden reviews` filters on, and it
   * is what `update_business_rating()` excludes from the aggregate. So a client
   * that inserts with `is_hidden = true` writes a row that is invisible AND
   * contributes nothing to the business rating, and a client that inserts with
   * `is_hidden = false` writes a row that is public immediately with no
   * approval step at all — the second is the one that makes the moderation queue
   * optional rather than real, and it is also just the column default.
   *
   * `moderated_by` is the sharper half: it is a foreign key to `profiles(id)`,
   * so a client can stamp its forged review as though a REAL ADMIN had approved
   * it, and nothing downstream distinguishes that from the genuine article
   * because nothing downstream re-derives it. That is a data-integrity claim
   * about a moderation AUDIT TRAIL, and it is asserted as a value.
   */
  test('a client can INSERT the moderation columns verbatim, and no trigger overwrites them', async () => {
    // The trigger set, so the "no trigger defends this" claim is a measurement.
    const triggers = await ctx.sql.unsafe<{ tgname: string; def: string }[]>(
      `select t.tgname, pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'reviews' and not t.tgisinternal
        order by t.tgname`,
    );
    const names = plainRows(triggers).map((t) => t.tgname);
    expect(names).toEqual([
      'on_review_change',
      'on_review_offer_change',
      'set_reviews_updated_at',
    ]);
    // Only two of the three are on INSERT, and the relevant fact about both is
    // that they are AFTER triggers calling functions that write to OTHER tables.
    for (const def of plainRows(triggers)
      .filter((t) => t.tgname !== 'set_reviews_updated_at')
      .map((t) => t.def)) {
      expect(def).toContain('AFTER INSERT OR DELETE OR UPDATE');
    }
    expect(
      plainRows(triggers).find((t) => t.tgname === 'set_reviews_updated_at')
        ?.def,
      'set_reviews_updated_at changed shape. It is BEFORE UPDATE and touches ' +
        'updated_at only, which is why the INSERT assertions below are not ' +
        'affected — but assert the change if it happens.',
    ).toContain('BEFORE UPDATE');

    const before = await reviewCount();

    /**
     * ─── Why the cleanup wraps the WHOLE body, and not the end of it ──────────
     *
     * The first draft put the DELETE in a `try { … } finally { … }` around a
     * trailing FK assertion, which put it AFTER every behavioural probe. The
     * first probe's aggregate assertion then failed, the `finally` was never
     * reached, and the hidden review stayed in the table for the next six tests
     * — each of which failed on a count that was one too high, with a message
     * that pointed at the wrong thing entirely.
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
      // moderator. The check constraint is satisfied: `is_hidden = true` requires
      // a `moderation_reason`, and the client supplies one.
      const inserted = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.reviews
             (user_id, business_id, rating, comment, is_hidden, moderated_by,
              moderated_at, moderation_reason, hidden_reason)
           values ('${MEMBER}', '${BIZ_A}', 5, 'RLS self-moderated', true,
                   '${ADMIN}', now(), 'client supplied this', 'client also supplied this')
           returning id, is_hidden, moderated_by::text, moderation_reason, hidden_reason`,
        ),
      );
      expect(
        inserted,
        'a client could not write the moderation columns on INSERT. If this now ' +
          'fails, the INSERT grant no longer covers them and the moderation ' +
          'surface described in the header is closed.',
      ).toBeNull();

      // Re-read as the owner, because reading it back through a client session
      // would go through the moderation SELECT policy this test is not about.
      const landed = await ctx.sql.unsafe<
        {
          user_id: string;
          comment: string;
          is_hidden: boolean;
          moderated_by: string;
          moderated_at_set: boolean;
          moderation_reason: string;
          hidden_reason: string;
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
        'the row did not keep the moderation values the client sent. A trigger ' +
          'overwrote them, which is a DIFFERENT defence from a grant and would ' +
          'change what the header claims — assert it deliberately if it happens.',
      ).toEqual([
        {
          user_id: MEMBER,
          comment: 'RLS self-moderated',
          is_hidden: true,
          moderated_by: ADMIN,
          moderated_at_set: true,
          moderation_reason: 'client supplied this',
          hidden_reason: 'client also supplied this',
        },
      ]);

      // The soft-hide consequence, and the reason this matters: the row is
      // invisible to the anonymous feed immediately, on the client's own say-so.
      const inAnonFeed = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews where comment = 'RLS self-moderated'`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      );
      expect(
        inAnonFeed,
        'a client-hid review is in the anonymous feed, so `is_hidden` written by ' +
          'a client does not gate visibility',
      ).toEqual([]);

      // The aggregate consequence. `update_business_rating()` filters
      // `is_hidden is not true`, so a client-hidden row is EXCLUDED from both
      // halves of the aggregate: `review_count` does not move and the average is
      // untouched. The baseline is the two seeded reviews, which carry
      // `business_rating` 5 and 4 — so the business sits at 4.50 / 2, and both
      // numbers are asserted because "the aggregate did not change" is a claim
      // and the claim is only interesting if the baseline is stated.
      const aggregate = await ctx.sql.unsafe<
        { rating: string; review_count: number }[]
      >(
        `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
      );
      expect(
        plainRows(aggregate),
        'a client-hidden review changed the business aggregate. ' +
          '`update_business_rating()` is documented as filtering on ' +
          '`is_hidden is not true`, so this is a change in the trigger.',
      ).toEqual([{ rating: '4.50', review_count: 2 }]);

      // And the OTHER direction, which is the approval step: `is_hidden = false`
      // is the column DEFAULT, so a client writing it explicitly gets a public
      // review with no moderation queue involved at all. Asserted because the
      // interesting property is that nothing distinguishes the explicit write from
      // the default — there is no "pending" state on this table.
      const publicOnInsert = await deniedAs(
        ctx.sql,
        'authenticated',
        MEMBER,
        (tx) =>
          tx.unsafe(
            `insert into public.reviews (user_id, business_id, rating, comment, is_hidden, moderation_reason)
           values ('${MEMBER}', '${BIZ_A}', 5, 'RLS published on insert', false, 'approved')
           returning id, is_hidden`,
          ),
      );
      expect(
        publicOnInsert,
        'a client could not publish a review on insert',
      ).toBeNull();
      const published = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ comment: string }[]>(
            `select comment from public.reviews where comment = 'RLS published on insert'`,
          )
          .then((rows) => rows.map((r) => r.comment)),
      );
      expect(
        published,
        'a review a client published on insert is not in the anonymous feed, so ' +
          'the INSERT path does publish immediately',
      ).toEqual(['RLS published on insert']);

      // And the aggregate DOES move for the visible one, by exactly one and with
      // the average unchanged — because this client wrote `rating` and left
      // `business_rating` NULL, and `avg()` skips NULLs. So the count is the
      // number a client can move unilaterally, and it moves it on the business
      // it just reviewed.
      const afterPublic = await ctx.sql.unsafe<
        { rating: string; review_count: number }[]
      >(
        `select rating, review_count from public.businesses where id = '${BIZ_A}'`,
      );
      expect(
        plainRows(afterPublic),
        'a client-published review did not move review_count, or moved the ' +
          'average as well. Both halves are measured: the count is client ' +
          'controlled and the average is not, because `avg(business_rating)` ' +
          'skips the NULL the client left behind.',
      ).toEqual([{ rating: '4.50', review_count: 3 }]);
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
   * The moderation columns are NOT writable by UPDATE, and that is the
   * asymmetry the previous test makes legible.
   *
   * A client can write `is_hidden` on INSERT and cannot write it on UPDATE. Both
   * halves are the same column grant, seen from two directions: the INSERT
   * grant covers all 15 columns and the UPDATE grant covers 4, and
   * `is_hidden` is in the first list and not the second. The consequence is
   * that a review's moderation state is decided once, at insert time, by the
   * client, and is thereafter immutable to it.
   *
   * That is worth pinning because it is easy to read the previous test as "a
   * client controls moderation" and conclude the queue is meaningless. What it
   * actually means is narrower and stranger: the client chooses the review's
   * moderation state at birth and can never change it, including to un-hide a
   * review it hid and including to hide one a real admin published. The
   * moderation decision is a property of the INSERT, not a state the row moves
   * through.
   */
  test('the moderation columns are insert-writable and update-inert, which is an asymmetry not a boundary', async () => {
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
          'asymmetry this test describes is gone',
      ).not.toBeNull();
      expect(denial?.message).toContain('permission denied for table reviews');
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
   * exception: `anon` holds the DELETE grant, "Users can delete own reviews" is
   * `TO public` with `USING (user_id = auth.uid())`, and with `auth.uid()` NULL
   * that matches nothing. The statement SUCCEEDS and deletes zero rows.
   *
   * The consequence is stated here because it is the part that survives into
   * production behaviour: the refusal is SILENT. A client that checks for an
   * error and not for a row count will conclude it deleted a review it did not
   * delete. That is not a database bug, it is the ordinary contract of a PERMISSIVE
   * DELETE policy with a NULL subject, and it is the exact opposite of the write
   * paths on `orders` in `orders.rls.db.spec.ts`, where the revoke turned the same
   * statement shape into a `42501`. Same statement, opposite outcome, purely
   * because of the grant.
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

    // The contrast that makes the silence a finding rather than an observation:
    // the SAME role, the same policy, the same statement shape — with a claim.
    // The only difference is `auth.uid()` being NULL instead of set, and the
    // count is what separates them.
    //
    // AND THE CLAIMED VERSION DELETES. This is the third thing a brief about
    // `anon` and `reviews` gets wrong, and it is the one that matters most,
    // because it is silent in BOTH directions: the no-claim delete raises
    // nothing and removes nothing, and the claimed delete raises nothing and
    // removes everything that user wrote.
    //
    // `USING (user_id = auth.uid())` is satisfied by a claim, and a claim is not
    // something the ROLE grants. So an `anon` session presenting a sub for a real
    // user deletes that user's reviews — including the ones it forged a moment
    // earlier, which is the one mitigation the table has, and which is therefore
    // available to the same party that planted them.
    //
    // The scope is asserted, not just the count, because "it deleted something"
    // and "it deleted that user's rows and nobody else's" are different claims
    // and only the second one is a boundary. A claim for a user with no reviews
    // deletes nothing, which is the control.
    const withClaim = await deniedAs(ctx.sql, 'anon', MEMBER, (tx) =>
      tx.unsafe(`delete from public.reviews where true`),
    );
    expect(
      withClaim,
      'anon with MEMBER’s sub-claim raised on delete. The DELETE policy is ' +
        '`user_id = auth.uid()`, so a claim makes it match — if that ever ' +
        'raises, the policy is not the thing deciding.',
    ).toBeNull();

    const afterClaim = await ctx.sql.unsafe<{ id: string; user_id: string }[]>(
      `select id, user_id::text from public.reviews order by id`,
    );
    expect(
      plainRows(afterClaim),
      'anon with a sub-claim did not delete exactly the claimed user’s rows. ' +
        'The claim is what satisfies `user_id = auth.uid()`, so this must be ' +
        'MEMBER’s review gone and STRANGER’s untouched.',
    ).toEqual([{ id: REVIEW.S, user_id: STRANGER }]);

    // The control: a claim for a user who wrote nothing removes nothing, so the
    // previous assertion is measuring the policy and not "anon can delete".
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
    ).toEqual([{ id: REVIEW.S }]);

    // Restore, in the shape the rest of the file uses: a keyed re-insert rather
    // than an UPDATE, because the row is genuinely gone. `on conflict (id) do
    // nothing` keeps it safe to re-run, and the three rating columns are written
    // so the derived business aggregate is the one the rest of the file expects.
    await ctx.sql.unsafe(`
      insert into public.reviews
        (id, user_id, business_id, order_id, rating, business_rating, product_rating, comment)
      values ('${REVIEW.M}', '${MEMBER}', '${BIZ_A}', '${ORDER.M}', 5, 5, 5, 'RLS review mine')
      on conflict (id) do nothing
    `);
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
   * The absence that matters is the last two rows: "Users can update own reviews"
   * is `TO public` and is NOT dead code (the column grant makes it reachable),
   * and there is no INSERT policy restricting `is_hidden`. `anon` reaches every
   * row of this table through five policies, four of them `TO public`, and the
   * only command none of them governs is the one `anon` can perform without
   * limit: TRUNCATE.
   */
  test('the policy set on reviews is five policies, four of them TO public', async () => {
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
        roles: ['public'],
      },
      {
        policyname: 'Users can insert own reviews',
        cmd: 'INSERT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        policyname: 'Users can update own reviews',
        cmd: 'UPDATE',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
    ]);

    // Said a second way, so a future migration that adds a sixth policy fails on
    // the count rather than inside a five-element array.
    expect(
      plainRows(rows).filter((r) => r.roles.includes('public')),
    ).toHaveLength(4);
  });
});

describe('the two things the reviews grant does not stop', () => {
  /**
   * A consumer can post a review for a business it never bought from, and
   * nothing in the policies notices.
   *
   * `Users can insert own reviews` is `WITH CHECK (user_id = auth.uid())` and
   * that is the whole check. There is no `EXISTS` against `orders`, so the
   * "you reviewed a place you went to" invariant is not expressed anywhere in
   * the database — not in a policy, not in a CHECK constraint, not in a trigger.
   *
   * In a marketplace that is the review-fraud primitive, and it is cheaper than
   * it looks: `reviews_user_id_order_id_key` is `UNIQUE (user_id, order_id)`,
   * and `order_id` is NULLABLE, and a UNIQUE constraint does not treat NULLs as
   * equal to each other. So a consumer can insert as many reviews as it likes
   * against any `business_id` by leaving `order_id` NULL, and each one is a
   * distinct row.
   *
   * The consequence is measured on the aggregate, because that is where a
   * marketplace's reputation actually lives: `on_review_change` fires
   * `update_business_rating()`, and a review with a NULL `business_rating`
   * contributes to `review_count` while dragging the average towards zero. Both
   * halves are asserted as values, and the count is asserted to be larger than
   * the number of distinct orders — that ratio IS the finding.
   */
  test('a consumer can review a business it never bought from, once per row while order_id is NULL', async () => {
    // The UNIQUE constraint that looks like it would stop this, and does not.
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
      'reviews.order_id became NOT NULL, so UNIQUE (user_id, order_id) now ' +
        'actually bounds how many reviews a consumer can post and this test is ' +
        'describing a hole that is closed',
    ).toBe('YES');

    const before = await reviewCount();

    // A review for `BIZ_B`, which this consumer never bought from, and with no
    // `order_id` at all.
    const forged = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_B}', 1, 'RLS never bought here') returning id`,
      ),
    );
    expect(
      forged,
      'a consumer could not review a business it never bought from. The ' +
        'WITH CHECK is only `user_id = auth.uid()`, so nothing should have ' +
        'refused it — if this fails, a policy was added and this file is stale.',
    ).toBeNull();

    // And the UNIQUE constraint does not stop a second one either.
    const second = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `insert into public.reviews (user_id, business_id, rating, comment)
         values ('${MEMBER}', '${BIZ_B}', 1, 'RLS never bought here either') returning id`,
      ),
    );
    expect(
      second,
      'a second NULL-order_id review was refused by UNIQUE',
    ).toBeNull();

    // The measurement: two rows, ZERO distinct orders, at a business with no
    // relationship to this consumer. The ratio is the finding.
    const planted = await ctx.sql.unsafe<
      { c: number; distinct_orders: number }[]
    >(
      `select count(*)::int as c, count(distinct order_id)::int as distinct_orders
         from public.reviews
        where business_id = '${BIZ_B}' and user_id = '${MEMBER}'`,
    );
    expect(plainRows(planted)).toEqual([{ c: 2, distinct_orders: 0 }]);

    // The aggregate consequence. `rating` is written and `business_rating` is
    // not, so the review counts toward `review_count` and averages towards zero.
    // Both columns are read, because "it is in the table" is not the claim —
    // "it moves the business's public reputation" is.
    const aggregate = await ctx.sql.unsafe<
      { id: string; rating: string; review_count: number }[]
    >(`select id, rating, review_count from public.businesses order by id`);
    const b = plainRows(aggregate).find((r) => r.id === BIZ_B);
    expect(
      b,
      'the planted reviews did not reach business_moderation-adjacent ' +
        'aggregates at all, so the reputation consequence this test claims ' +
        'does not happen',
    ).toEqual({ id: BIZ_B, rating: '0.00', review_count: 2 });

    // And they are public immediately, which is what makes it reputation and not
    // a moderation queue.
    const inFeed = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ comment: string }[]>(
          `select comment from public.reviews
            where business_id = '${BIZ_B}' and user_id = '${MEMBER}'
            order by comment`,
        )
        .then((rows) => rows.map((r) => r.comment)),
    );
    expect(inFeed).toEqual([
      'RLS never bought here',
      'RLS never bought here either',
    ]);

    // The cleanup is a plain DELETE of rows this test created, and it is guarded
    // by the same incoming-FK assertion the moderation block uses: nothing
    // references `reviews` today, and a `finally` that raises would skip the
    // aggregate restore below and leave the rest of the file measuring planted
    // reviews.
    try {
      const noIncomingFk = await ctx.sql.unsafe<{ c: number }[]>(
        `select count(*)::int as c from pg_constraint where confrelid = 'public.reviews'::regclass`,
      );
      expect(plainRows(noIncomingFk)[0]?.c).toBe(0);
    } finally {
      await ctx.sql.unsafe(
        `delete from public.reviews where comment in ('RLS never bought here', 'RLS never bought here either')`,
      );
    }

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
