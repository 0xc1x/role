import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  KNOWN_REPLAY_FAILURES,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * `public.businesses` and its three companion tables under a real login, a real
 * role and the real policies — the catalog every anonymous visitor reads, and
 * the table every business owner writes.
 *
 * ─── Why this file exists, and why it is not a third repeat ─────────────────
 *
 * `categories.rls.db.spec.ts` proved a harness can execute a policy. `orders`
 * applied it to a table behind the API. This one applies it to the table that is
 * BOTH of those and neither, and that combination is what makes it its own
 * subject:
 *
 * 1. `businesses` is read by `anon`. It is the only table in the ledger where an
 *    unauthenticated browser holds a grant, so the public catalog is defined by
 *    exactly one policy — and that policy now carries the moderation gate, which
 *    makes it the most load-bearing `USING` clause in the product.
 *
 * 2. `businesses` is written by `authenticated`, and the write is COLUMN-SCOPED.
 *    `20260926010336_businesses_client_write_grants.sql` restores the client
 *    write path with `grant insert (name, slug, …) on table public.businesses`
 *    rather than with a table-level grant. So
 *    `has_table_privilege('authenticated','businesses','insert')` is FALSE while
 *    the INSERT is perfectly reachable. This file is the one place in the suite
 *    where "no table privilege" and "cannot write" are two different questions
 *    with two different answers, and conflating them is not a style problem: it
 *    is how a real panel ends up with
 *    `42501 permission denied for table businesses` and a plausible-looking fix
 *    that re-grants the whole table.
 *
 * ─── The one claim in this file that is NOT production ──────────────────────
 *
 * `20260927025753_businesses_drop_sensitive_columns.sql` is one of the seven
 * pinned `KNOWN_REPLAY_FAILURES`. It rolled back whole, so in THIS database:
 *
 *   - the seven moved columns (`owner_id`, `balance`, `commission_rate`,
 *     `verification_status`, `verified_at`, `verified_by`, `rejection_reason`)
 *     are STILL ON `businesses`, and `businesses` has 24 columns, not the 17
 *     production has;
 *   - the ownership policies on `businesses` still resolve through
 *     `businesses.owner_id` and have not been rewritten to the
 *     `business_ownership` EXISTS subquery;
 *   - `trg_bootstrap_business_companions` does not exist, so a client-created
 *     business writes NO ownership row;
 *   - `trg_sync_business_verification` is still the phase-2 version that lives
 *     on `businesses` and derives `is_active` from `verification_status`, rather
 *     than the phase-3 pair on `business_moderation`.
 *
 * Everything asserted here is measured against that reality and labelled. Where
 * a criterion could not be made green because of this file, the test PINS the
 * debt and names the migration that owes it — see
 * `public.businesses: the shape phase 3 owes` below. Nothing is papered over with
 * a harness grant, and `PLATFORM_GRANTS_AFTER_REPLAY` in
 * `test/supabase-platform.ts` stays empty.
 *
 * ─── The invariant: what makes the public catalog trustworthy ─────────────
 *
 * `anon` sees a business if and only if it is `is_active = true` AND its
 * moderation state is `approved`. Two conditions, and the second one is a
 * policy rather than a column grant.
 *
 * This file used to be about the absence of that second condition, and the
 * history is worth keeping because the shape of the hole is the reason the fix
 * is shaped the way it is. `is_active` is a DERIVED COPY: `trg_default_business_
 * inactive` forces it false on insert, and `trg_sync_business_verification`
 * re-derives it from `verification_status`. The policy used to read the copy
 * rather than the source, and a business written `is_active = true` while
 * `verification_status` stayed `pending` WAS in the anonymous catalog.
 *
 * Two other layers did not hold the line either, and both were measured here
 * rather than argued:
 *
 *   - the column grant. `is_active` being absent from the client write grants
 *     in 20260926010336 was the only thing stopping the escalation. A grant
 *     lives in information_schema.column_privileges, it can be restored by a
 *     routine migration — and this ledger HAS restored one, twenty minutes
 *     after revoking it (20260925163235, then 20260925224820) — and it protects
 *     a COLUMN while the invariant to protect is a ROW.
 *
 *   - the trigger, which does not block. It is `BEFORE INSERT OR UPDATE OF
 *     verification_status`, so an UPDATE touching only `is_active` never fires
 *     it, and one that sets `verification_status` fires it and gets `is_active`
 *     derived. The trigger is the propagation mechanism that makes moderation
 *     work for the API. It has no idea who is asking.
 *
 * So the gate is now a policy that reads the SOURCE, on
 * `public.business_moderation`, through a SECURITY DEFINER helper. The two
 * tests that used to prove the hole are still here and still valuable: the one
 * that restores the write grant now proves the escalation no longer reaches the
 * catalog, and the one that writes an active-but-unapproved row now proves the
 * policy hides it. Both are the same measurement pointed the other way, and
 * they are the tests that fail if this gate is ever quietly dropped.
 */

/** Personas. The `1111…` shape matches the other two specs so they read alike. */
const ADMIN = '22222222-2222-2222-2222-222222222222';
/** A consumer. Owns nothing — the control for "owns nothing" vs "owns another". */
const MEMBER = '11111111-1111-1111-1111-111111111111';
/** Owner of the active, approved business. */
const OWNER_A = '44444444-4444-4444-4444-444444444444';
/** Owner of the inactive, pending business and of the one used for the probe. */
const OWNER_B = '55555555-5555-5555-5555-555555555555';

/** Active AND approved. The one business the anonymous catalog is supposed to show. */
const BIZ_A = 'aaaaaaaa-0000-4000-8000-000000000001';
/** Inactive and pending. Owned by B, so it is the cross-tenant target. */
const BIZ_B = 'aaaaaaaa-0000-4000-8000-000000000002';
/** Inactive and pending, and owned by nobody in `business_ownership`. */
const BIZ_C = 'aaaaaaaa-0000-4000-8000-000000000003';

const SLUG_A = 'rls-biz-a';
const SLUG_B = 'rls-biz-b';
const SLUG_C = 'rls-biz-c';

/**
 * The 17 columns production's `businesses` holds after phase 3, in order.
 *
 * Written out rather than derived so that a future column split shows up as a
 * one-line diff in the test output. This database has 24: these seven plus the
 * ones phase 3 is supposed to have dropped.
 */
const PUBLIC_COLUMNS: readonly string[] = [
  'id',
  'name',
  'type',
  'slug',
  'image',
  'cover_image',
  'rating',
  'review_count',
  'description',
  'phone',
  'email',
  'website',
  'is_active',
  'created_at',
  'updated_at',
  'currency',
];

/**
 * The seven columns `20260927025753` drops, in the order the migration lists them.
 *
 * Their ABSENCE is the contract: once they live on the companions, table-level
 * SELECT on `businesses` stops being a data breach, and the whole reason
 * `20260925224820` had to leave seven sensitive columns readable by `anon` goes
 * away. The test that asserts their absence is the only thing that notices if a
 * future migration re-adds one.
 */
const MOVED_COLUMNS: readonly string[] = [
  'owner_id',
  'balance',
  'commission_rate',
  'verification_status',
  'verified_at',
  'verified_by',
  'rejection_reason',
];

/**
 * The client INSERT columns, exactly as `20260926010336` grants them.
 *
 * `owner_id` is in the set on purpose, and the migration says why: the column is
 * NOT NULL, the client payload is not supposed to carry it, and the RLS policy's
 * `WITH CHECK` is what stops the caller from filling it with somebody else. The
 * trigger fills it for a normal client. Both of those facts are asserted below,
 * and the fact that the grant includes the column is the reason the phase-3
 * column drop is not a purely additive change.
 */
const CLIENT_INSERT_COLUMNS: readonly string[] = [
  'cover_image',
  'description',
  'email',
  'image',
  'name',
  'owner_id',
  'phone',
  'slug',
  'type',
  'website',
];

/** The client UPDATE columns, exactly as `20260926010336` grants them. */
const CLIENT_UPDATE_COLUMNS: readonly string[] = [
  'cover_image',
  'description',
  'email',
  'image',
  'name',
  'phone',
  'type',
  'updated_at',
  'website',
];

let ctx: SupabaseTestDb;

/**
 * postgres.js answers with a `RowList`, which is an array that also carries
 * query metadata. `toEqual` compares the metadata too and does not typecheck
 * against it. Same normalisation as the other two specs: spread it.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // Through `auth.users`, never straight into `profiles`: the only producer of
    // a profile is the `on_auth_user_created` trigger, and `auth_helpers.my_role()`
    // reads `public.profiles`, so a hand-written profile would be a fixture that
    // cannot exist in production.
    for (const [id, name] of [
      [ADMIN, 'admin'],
      [MEMBER, 'member'],
      [OWNER_A, 'owner-a'],
      [OWNER_B, 'owner-b'],
    ] as const) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${name}@rls-businesses.test')
         on conflict (id) do nothing`,
      );
    }
    await tx.unsafe(
      `update public.profiles set role = 'admin' where id = '${ADMIN}'`,
    );

    /**
     * Three businesses, and every one of them is inserted the way the ledger's
     * trigger chain forces it to be inserted.
     *
     * `is_active` and `verification_status` are NOT written here on purpose even
     * though the schema owner could write either. `trg_default_business_inactive`
     * forces `is_active := false`, and `trg_sync_business_verification` then
     * re-derives it from `verification_status` — and since both triggers run
     * BEFORE INSERT in name order, `trg_sync_business_verification` is the one
     * that wins. An INSERT carrying `is_active = true, verification_status =
     * 'approved'` therefore lands ACTIVE, which is a real property and not a
     * fixture mistake, and the first draft of this seed assumed otherwise and
     * produced an "inactive" persona that was active.
     *
     * The rule this file follows because of that: every assertion about a row's
     * moderation state RE-READS the column instead of trusting the INSERT. A
     * fixture that quietly is not what it claims leaves every test using it
     * green and meaningless.
     */
    await tx.unsafe(`
      insert into public.businesses (id, owner_id, name, type, slug, is_active, verification_status)
      values ('${BIZ_A}', '${OWNER_A}', 'RLS businesses A', 'restaurant', '${SLUG_A}', true,  'approved'),
             ('${BIZ_B}', '${OWNER_B}', 'RLS businesses B', 'restaurant', '${SLUG_B}', false, 'pending'),
             ('${BIZ_C}', '${OWNER_B}', 'RLS businesses C', 'restaurant', '${SLUG_C}', false, 'pending');
    `);

    /**
     * The companion rows, seeded by hand, and that is a substitution worth
     * stating plainly.
     *
     * In production `trg_bootstrap_business_companions` writes these three rows
     * for every business, and `20260925225227` backfilled the existing ones. That
     * trigger is created by `20260927025753`, which is one of the seven pinned
     * replay failures, so in THIS database nothing writes them automatically and
     * a spec that expected the trigger to have done it would find empty tables.
     *
     * So the fixture stands in for the trigger. It is a fixture, not a grant, and
     * it is seeded as the schema owner because that is the role the trigger's
     * SECURITY DEFINER body effectively writes as. The test
     * `a client-created business writes no ownership row` asserts that nothing
     * else wrote them, so this substitution cannot quietly become a claim that
     * the trigger works.
     *
     * The `business_moderation` row is now LOAD-BEARING in a way the other two
     * are not, and the substitution has to be read differently because of it.
     * Since 20260928101500 the public catalog policy reads this table, so if this
     * row were missing, `anon` would see NOTHING rather than seeing `BIZ_A` too
     * much. That is a different failure from every other fixture mistake in this
     * file — it HIDES rows instead of inventing them — and it is why the seeded
     * row is asserted to exist and to be `approved` before any catalog assertion
     * runs, rather than only here.
     *
     * `BIZ_B` and `BIZ_C` deliberately get NO moderation row. They are the
     * unapproved fixtures the gate has to hide, and an explicit `pending` row
     * would be a weaker test: an absent row is the shape every client-created
     * business has, and the gate has to fail closed on it.
     *
     * `business_finance` is given a non-default balance and commission rate on
     * purpose: a reader who could reach the table must not be able to say the
     * defaults made the row look empty.
     */
    await tx.unsafe(`
      insert into public.business_ownership (business_id, owner_id)
      values ('${BIZ_A}', '${OWNER_A}'),
             ('${BIZ_B}', '${OWNER_B}');

      insert into public.business_finance (business_id, balance, commission_rate)
      values ('${BIZ_A}', 1234.56, 0.2500);

      insert into public.business_moderation (business_id, verification_status)
      values ('${BIZ_A}', 'approved');
    `);
  });
});

afterAll(async () => {
  await ctx.stop();
});

/**
 * The three seeded slugs, written out so every exact assertion in this file is
 * scoped to the fixture rather than to a prefix.
 *
 * Several tests below CREATE businesses — that is the point of them, since a
 * client can insert — and `as()` commits. A prefix scope would sweep those rows
 * into every visibility assertion and make each of them depend on test ordering.
 * An explicit list means the probes are visible to the tests that created them
 * and invisible to the rest, which is the only arrangement where "a member reads
 * exactly the active catalog" is a statement about the policies.
 */
const SEEDED_SLUGS: readonly string[] = [SLUG_A, SLUG_B, SLUG_C];

/** Slugs of the three seeded businesses visible to the current session. */
async function visibleSlugs(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ slug: string }[]>(
        `select slug from public.businesses
          where slug in ('${SEEDED_SLUGS.join("', '")}')
          order by slug`,
      )
      .then((rows) => rows.map((r) => r.slug));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

/**
 * `business_ownership` rows visible to the current session, as `business_id`.
 *
 * There is deliberately no `anon` arm, and the reason is worth stating because it
 * is the answer to the "strictly fewer" problem this file had to solve: `anon`
 * holds no privilege on this table at all, so `as()` would THROW rather than
 * return an empty set. The `anon` case is therefore asserted where it belongs —
 * as a grant refusal with its message shape pinned, in
 * `business_ownership isolates tenants` — rather than being flattened into a
 * "zero rows" result that would look like a policy outcome.
 */
async function visibleOwnership(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ business_id: string }[]>(
        `select business_id::text from public.business_ownership order by business_id`,
      )
      .then((rows) => rows.map((r) => r.business_id));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the impersonation is live on these tables', () => {
  /**
   * Copied from `orders.rls.db.spec.ts` rather than re-invented, because the
   * failure it guards against is the one that makes an entire RLS suite
   * worthless: the roles are `nologin` and RLS is enabled but NOT forced, so a
   * session that forgets `set local role` runs as the table owner and bypasses
   * every policy in this file while every assertion still passes.
   *
   * The second table is `business_ownership` rather than `businesses`, and the
   * reason is the shape of the policy set. `anon` holds NO privilege there, and
   * neither of its two policies names `anon` in the `TO` list, so there is no
   * permissive policy that could OR its way into producing a row for a browser
   * with no JWT. A zero here means the policies ran, full stop.
   */
  test('becoming a role changes the session identity', async () => {
    const owner = await ctx.sql.unsafe<
      { current_user: string; session_user: string }[]
    >(`select current_user, session_user`);
    const anon = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<
        { current_user: string; session_user: string; uid: string | null }[]
      >(`select current_user, session_user, auth.uid()::text as uid`),
    );

    expect(owner[0]?.current_user).toBe('postgres');
    expect(anon[0]?.current_user).toBe('anon');
    // Same session, different role. If these diverge the impersonation became a
    // connection, and the role no longer describes the privileges in play.
    expect(anon[0]?.session_user).toBe(owner[0]?.session_user);
  });

  /**
   * The other half, and it is load-bearing on THIS table specifically.
   *
   * "Anyone can view active businesses" is `TO public`, so `anon` is evaluated
   * against it. And every ownership policy in the ledger is written as a
   * comparison against `auth.uid()`. Under a harness that always supplied a
   * subject, "this row is not mine" and "there is nobody" would be
   * indistinguishable, and a null subject that silently became a real uuid would
   * hand every persona someone else's businesses.
   */
  test('auth.uid() is null when anonymous and the subject when signed in', async () => {
    const anonymous = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ uid: string | null }[]>(`select auth.uid()::text as uid`),
    );
    const signedIn = await as(ctx.sql, 'authenticated', OWNER_A, (tx) =>
      tx.unsafe<{ uid: string | null }[]>(`select auth.uid()::text as uid`),
    );

    expect(anonymous[0]?.uid).toBeNull();
    expect(signedIn[0]?.uid).toBe(OWNER_A);
  });

  /**
   * The meta-test, on the table where "strictly fewer" is unambiguous.
   *
   * The brief for this file warned about the obvious framing, and the warning is
   * right: on `businesses`, a business owner is not "the owner" of the table. An
   * owner of business A legitimately sees every ACTIVE business in the catalog,
   * including ones it does not own, so "client sees fewer rows than the owner"
   * is a statement about how many inactive rows exist, not about ownership, and
   * it can be made true or false by seeding alone.
   *
   * `business_ownership` has no such ambiguity. Its only two policies are
   * `owner_id = auth.uid()` and the admin one, both `TO authenticated`, and the
   * client role holds SELECT on nothing else. So the rows a client can see are
   * exactly its own, and a client that saw one it did not own would mean a policy
   * had been widened. The schema owner — who bypasses RLS entirely, and is
   * therefore the only way to see the full set — holds two.
   */
  test('a client role sees strictly fewer ownership rows than the owner, and no row that is not its own', async () => {
    const asSchemaOwner = await visibleOwnership(ctx.sql, 'owner', null);
    const asOwnerA = await visibleOwnership(ctx.sql, 'authenticated', OWNER_A);
    const asOwnerB = await visibleOwnership(ctx.sql, 'authenticated', OWNER_B);
    const asMember = await visibleOwnership(ctx.sql, 'authenticated', MEMBER);

    expect(asSchemaOwner).toEqual([BIZ_A, BIZ_B]);
    expect(asOwnerA).toEqual([BIZ_A]);
    expect(asOwnerB).toEqual([BIZ_B]);
    // A signed-in user that owns nothing owns no rows. A member holding a
    // non-empty set here would mean a policy resolved ownership by something
    // other than `auth.uid()`.
    expect(asMember).toEqual([]);

    // RLS narrows, it never widens. This is the invariant the pilot pins on
    // `categories`, and the direction matters: a permissive policy that ORed its
    // way in would show up here and nowhere else.
    const ownerSet = new Set(asSchemaOwner);
    const leaked = [...asOwnerA, ...asOwnerB, ...asMember].filter(
      (id) => !ownerSet.has(id),
    );
    expect(
      leaked,
      'a client role saw an ownership row the owner cannot see',
    ).toEqual([]);
    expect(
      asSchemaOwner.length,
      `a member saw ${asMember.length} ownership rows; the difference must be ` +
        `strictly positive or the policies are not filtering`,
    ).toBeGreaterThan(asMember.length);

    // And the anonymous path is closed a layer earlier, which is the whole reason
    // it cannot be a "zero rows" comparison: `anon` is in the `TO` list of
    // neither ownership policy, so even with a grant it would get nothing. The
    // grant is what closes it today.
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`select business_id::text from public.business_ownership`),
    );
    expect(denial, 'anon read the ownership table').not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for table business_ownership',
    );
    expect(denial?.message).not.toContain('row-level security policy');
  });
});

describe('public.businesses: the shape of the grants', () => {
  /**
   * `anon` holds SELECT and nothing else, and the exact set is asserted rather
   * than a few spot checks.
   *
   * This is the INVERSE of the pilot's canary. On `categories`, Supabase's
   * default privileges hand `anon` all seven table privileges and the POLICIES
   * are the only thing refusing, so a denial there needs the grant asserted to
   * be meaningful. Here `20260925163235` revoked the rest and nothing gave it
   * back, so the GRANT is the boundary and every refusal in this file has to name
   * the layer that produced it.
   *
   * The companion tables are asserted in the same query on purpose. `anon` holds
   * absolutely nothing on any of them — not even SELECT — and that is the whole
   * reason the split was safe to do: moving the money and moderation columns off
   * a table `anon` must be able to read is only sound if the tables they land on
   * are not readable either.
   */
  test('anon holds SELECT and nothing else on businesses, and nothing at all on the companions', async () => {
    const catalog = await ctx.sql.unsafe<
      { table_name: string; grantee: string; privilege_type: string }[]
    >(
      `select table_name, grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   in ('businesses','business_ownership','business_finance','business_moderation')
          and grantee in ('anon', 'authenticated')
        order by table_name, grantee, privilege_type`,
    );

    expect(
      plainRows(catalog).map(
        (r) => `${r.table_name}/${r.grantee}/${r.privilege_type}`,
      ),
    ).toEqual([
      'business_ownership/authenticated/SELECT',
      'businesses/anon/SELECT',
      'businesses/authenticated/SELECT',
    ]);

    // The same question asked of the live session, all seven privileges, both
    // roles, so a grant that exists in the catalog and was revoked for this role
    // by something the view does not show cannot pass here.
    for (const [label, role] of [
      ['anon', 'anon'],
      ['authenticated', 'authenticated'],
    ] as const) {
      const live = await as(ctx.sql, role, null, (tx) =>
        tx.unsafe<Record<string, boolean>[]>(`
          select has_table_privilege('${role}', 'public.businesses', 'select')     as sel,
                 has_table_privilege('${role}', 'public.businesses', 'insert')     as ins,
                 has_table_privilege('${role}', 'public.businesses', 'update')     as upd,
                 has_table_privilege('${role}', 'public.businesses', 'delete')     as del,
                 has_table_privilege('${role}', 'public.businesses', 'truncate')   as trunc,
                 has_table_privilege('${role}', 'public.businesses', 'references') as refs,
                 has_table_privilege('${role}', 'public.businesses', 'trigger')    as trg,
                 has_table_privilege('${role}', 'public.business_ownership', 'select') as own_sel,
                 has_table_privilege('${role}', 'public.business_finance', 'select')  as fin_sel,
                 has_table_privilege('${role}', 'public.business_moderation', 'select') as mod_sel`),
      );
      expect(live[0], `${label} holds a table privilege it should not`).toEqual(
        {
          sel: true,
          ins: false,
          upd: false,
          del: false,
          trunc: false,
          refs: false,
          trg: false,
          own_sel: role === 'authenticated',
          fin_sel: false,
          mod_sel: false,
        },
      );
    }
  });

  /**
   * The heart of this file: `authenticated` has NO table-level write privilege on
   * `businesses` and a perfectly working write path anyway.
   *
   * Asserted on the exact column set rather than on a boolean, for two reasons.
   * The first is that a boolean cannot tell the safe shape from the dangerous
   * one: a migration that re-granted `insert on table public.businesses` would
   * make every denial in this file pass for a completely different reason, and a
   * test that only asked "can it write?" would not notice. The second is that
   * the column set is the actual security policy here — it is the list of what a
   * business owner is allowed to say about its own business — and `is_active`,
   * `verification_status`, `balance` and `commission_rate` being ABSENT from it
   * is the entire auto-approval defence.
   *
   * `owner_id` being present on INSERT and absent on UPDATE is the asymmetry
   * worth noticing. An owner can satisfy the NOT NULL column on insert, and RLS
   * decides whether it may name somebody else. It cannot move the column
   * afterwards, so ownership is assignable once and not transferable.
   */
  test('authenticated has no table write privilege, and column-level grants for exactly these columns', async () => {
    const live = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('authenticated', 'public.businesses', 'select')   as sel,
               has_table_privilege('authenticated', 'public.businesses', 'insert')   as ins,
               has_table_privilege('authenticated', 'public.businesses', 'update')   as upd,
               has_table_privilege('authenticated', 'public.businesses', 'delete')   as del,
               has_table_privilege('authenticated', 'public.businesses', 'truncate') as trunc`),
    );

    // The claim this file exists to keep honest. `ins: false` here does NOT mean
    // the INSERT is impossible; the next test runs the INSERT and it succeeds.
    expect(live[0]).toEqual({
      sel: true,
      ins: false,
      upd: false,
      del: false,
      trunc: false,
    });

    const columns = await ctx.sql.unsafe<
      { privilege_type: string; column_name: string }[]
    >(
      `select privilege_type, column_name
         from information_schema.column_privileges
        where table_schema = 'public'
          and table_name   = 'businesses'
          and grantee      = 'authenticated'
          and privilege_type <> 'SELECT'
        order by privilege_type, column_name`,
    );

    const byPrivilege = new Map<string, string[]>();
    for (const row of plainRows(columns)) {
      byPrivilege.set(row.privilege_type, [
        ...(byPrivilege.get(row.privilege_type) ?? []),
        row.column_name,
      ]);
    }

    expect(byPrivilege.get('INSERT')).toEqual([...CLIENT_INSERT_COLUMNS]);
    expect(byPrivilege.get('UPDATE')).toEqual([...CLIENT_UPDATE_COLUMNS]);
    expect(
      [...byPrivilege.keys()].sort(),
      'a write privilege appeared on businesses that the ledger never granted at ' +
        'column level — a table-level grant, most likely',
    ).toEqual(['INSERT', 'UPDATE']);

    // And the four columns that must never be in either set, asked about by name
    // so a future migration that adds one fails on a one-line diff.
    for (const column of [
      'is_active',
      'verification_status',
      'balance',
      'commission_rate',
    ]) {
      const held = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe<{ ins: boolean; upd: boolean }[]>(`
          select has_column_privilege('authenticated', 'public.businesses', '${column}', 'insert') as ins,
                 has_column_privilege('authenticated', 'public.businesses', '${column}', 'update') as upd`),
      );
      expect(
        held[0],
        `authenticated holds a write privilege on businesses.${column}`,
      ).toEqual({ ins: false, upd: false });
    }
  });

  /**
   * Naming a column outside the write grants is refused at the ACL layer, and the
   * message names the TABLE.
   *
   * This is the trap this file exists to document, and it is worth its own test
   * because of how the error reads. A client that calls `updateBusiness` with
   * `is_active` in the body gets
   *
   *     42501 permission denied for table businesses
   *
   * which is indistinguishable, to whoever is on call, from the
   * `20260925163235` incident this file's own migrations describe: a genuine
   * missing table grant, whose fix is a table-wide `GRANT UPDATE`, and which
   * would hand every client the moderation columns this file just proved it does
   * not have. The cause is a per-column ACL and the correct fix is a per-column
   * grant or a payload change.
   *
   * `DEFAULT` does not help, and that surprises people: the column is NAMED, and
   * naming a column you hold no privilege on is the refusal, whatever value you
   * give it. A table WITHOUT a column-level ACL entry behaves the opposite way,
   * where an omitted column is simply filled from the default.
   */
  test('naming a column outside the write grants is refused, and the message names the table', async () => {
    for (const [label, statement] of [
      [
        'insert naming a non-granted column',
        `insert into public.businesses (name, slug, type, is_active)
         values ('RLS businesses probe', 'rls-biz-probe', 'restaurant', true)`,
      ],
      [
        'insert naming a non-granted column with DEFAULT',
        `insert into public.businesses (name, slug, type, verification_status)
         values ('RLS businesses probe', 'rls-biz-probe', 'restaurant', DEFAULT)`,
      ],
      [
        'update naming a non-granted column',
        `update public.businesses set is_active = true where id = '${BIZ_B}' returning id`,
      ],
      [
        'update naming a non-granted column on a row the caller owns nothing of',
        `update public.businesses set verification_status = 'approved' where id = '${BIZ_B}' returning id`,
      ],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx.unsafe(statement),
      );

      expect(denial, `a client was able to ${label}`).not.toBeNull();
      expect(denial?.code).toBe('42501');
      // The table, not the column. Pinned because the fix this error invites is
      // the one that re-opens the whole table.
      expect(denial?.message).toContain(
        'permission denied for table businesses',
      );
      expect(
        denial?.message,
        `the refusal for "${label}" came from RLS rather than from the column ACL, ` +
          `so the grants have changed and this file no longer describes the right layer`,
      ).not.toContain('row-level security policy');
    }

    // And the counterpart, so the pair is not just a pile of refusals: an INSERT
    // that names only granted columns works, as `authenticated`, right now.
    const created = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `insert into public.businesses (name, slug, type) values ('RLS businesses probe', 'rls-biz-probe', 'restaurant')
         returning slug`,
      ),
    );
    expect(plainRows(created).map((r) => r.slug)).toEqual(['rls-biz-probe']);
  });

  /**
   * RLS is enabled on `businesses` and `business_ownership`, and NOT on the two
   * money/moderation companions.
   *
   * `relforcerowsecurity = false` is the production setting, and it is why the
   * impersonation in `as()` is load bearing rather than ceremonial: RLS applies
   * to every role except the table owner, and the owner is the role the harness
   * connects as.
   *
   * The companions being OFF is not an oversight and is the reason the next test
   * is shaped the way it is. There is nothing to filter rows with on
   * `business_finance`: the table is unreadable because no client role holds a
   * single privilege on it, not because a policy refuses them. If a future
   * migration granted SELECT to `authenticated` without enabling RLS, the table
   * would become a full, unfiltered read of every business's balance and
   * commission rate in one statement, and this assertion is the only thing in the
   * suite that would notice.
   */
  test('RLS is on for businesses and ownership, and off for the money and moderation companions', async () => {
    const rows = await ctx.sql.unsafe<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('businesses','business_ownership','business_finance','business_moderation')
        order by c.relname`,
    );

    expect(
      plainRows(rows).map((r) => [
        r.relname,
        r.relrowsecurity,
        r.relforcerowsecurity,
      ]),
    ).toEqual([
      ['business_finance', false, false],
      ['business_moderation', false, false],
      ['business_ownership', true, false],
      ['businesses', true, false],
    ]);
  });

  /**
   * No client role reaches `business_finance` or `business_moderation` — not
   * `anon`, not a member, not an admin, and not the OWNER of the business whose
   * money is in the row.
   *
   * That last one is the assertion that will look wrong to a reader and is the
   * point of the test: OWNER_A owns `BIZ_A`, and cannot read `BIZ_A`'s balance or
   * commission rate. There is no policy that would let it, because there are no
   * policies on those tables at all.
   *
   * ─── Why that is correct, and why it is going to be "fixed" one day ────────
   *
   * The money and the moderation state are PLATFORM facts, not tenant facts. The
   * API is the only writer: `accrue_order_earnings` and `generate_payouts` move
   * `balance`, and an admin's approval action is the only thing that writes
   * `verification_status` — both as SECURITY DEFINER functions, and the admin
   * panel reaches them through the NestJS API, which connects as the schema
   * owner or with `service_role`. A client-side "show me my earnings" screen is
   * therefore an API feature, and the correct implementation is an endpoint the
   * API authorises, not a grant.
   *
   * The temptation is real and it is worth naming precisely, because the fix
   * looks so reasonable: `grant select on business_finance to authenticated` plus
   * `alter table ... enable row level security` plus an owner policy. That is the
   * `business_ownership` shape, and it would work. What it would also do is put
   * a table whose RLS has never run behind a policy nobody has executed, on a
   * ledger whose client roles have been written to be unable to touch these
   * tables at all. If that is the product decision, it belongs in a migration
   * with its own tests, not as a patch for a missing screen.
   *
   * The refusal is asserted as `permission denied for table business_finance`
   * and explicitly NOT as a policy error, because there is no policy to produce
   * one. A test that accepted either would stop being evidence.
   */
  test('no client role reaches the money or moderation companions, and the owner cannot read its own balance', async () => {
    for (const [label, role, userId] of [
      ['anon', 'anon', null],
      ['a member', 'authenticated', MEMBER],
      ['the owner of that business', 'authenticated', OWNER_A],
      ['an admin', 'authenticated', ADMIN],
    ] as const) {
      for (const table of [
        'business_finance',
        'business_moderation',
      ] as const) {
        const denial = await deniedAs(ctx.sql, role, userId, (tx) =>
          tx.unsafe(`select * from public.${table}`),
        );

        expect(denial, `${label} was able to read ${table}`).not.toBeNull();
        expect(denial?.code).toBe('42501');
        expect(denial?.message).toContain(
          `permission denied for table ${table}`,
        );
        expect(
          denial?.message,
          `the refusal on ${table} came from RLS rather than from the grant. These ` +
            `tables have no policies at all, so a policy error here would mean ` +
            `something granted a client role access`,
        ).not.toContain('row-level security policy');
      }
    }

    // The row is really there and really carries a non-default balance, or the
    // refusals above would prove nothing about a populated table.
    const seeded = await ctx.sql.unsafe<
      {
        balance: string;
        commission_rate: string;
        verification_status: string;
      }[]
    >(
      `select f.balance::text, f.commission_rate::text, m.verification_status::text
         from public.business_finance f
         join public.business_moderation m on m.business_id = f.business_id
        where f.business_id = '${BIZ_A}'`,
    );
    expect(seeded[0]).toEqual({
      balance: '1234.56',
      commission_rate: '0.2500',
      verification_status: 'approved',
    });

    // The one role that is meant to read them, and it reads them as a
    // BYPASSRLS role with table-wide grants rather than through any policy.
    const asService = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ balance: string }[]>(
        `select balance::text from public.business_finance`,
      ),
    );
    expect(plainRows(asService).map((r) => r.balance)).toEqual(['1234.56']);
  });
});

describe('public.businesses: the shape phase 3 owes', () => {
  /**
   * `businesses` carries 24 columns here. Production carries 17.
   *
   * The seven extra ones are the ones `20260927025753` drops, and that migration
   * is one of the seven pinned `KNOWN_REPLAY_FAILURES` — it aborted on
   * `P0001 patron no encontrado en public.reserve_offer` while rewriting
   * functions in place by literal text matching, rolled back whole, and left the
   * phase-1 shape in place.
   *
   * So the criterion "the seven moved columns do not exist" cannot be made green
   * here, and the honest response is to pin the debt rather than to fake the
   * assertion. This test therefore asserts what the debt LOOKS like: the seven
   * columns are present, and the migration that owes their removal is still on
   * the pinned list.
   *
   * It is not a placeholder. When somebody fixes the replay, this test fails and
   * says why, which is the correct outcome — the file was describing a
   * pre-fix database and has to be rewritten, not silently re-baselined. The
   * companion test below is the one that asserts the contract itself, and it is
   * written so that it only becomes meaningful when the columns actually go.
   */
  test('the seven moved columns are still on businesses, and the migration that owes their absence is pinned debt', async () => {
    const columns = await ctx.sql.unsafe<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'businesses'
        order by ordinal_position`,
    );
    const present = plainRows(columns).map((c) => c.column_name);

    // The 17 production columns, in production order, all present and in place.
    expect(present.slice(0, 3)).toEqual(['id', 'owner_id', 'name']);
    for (const column of PUBLIC_COLUMNS) {
      expect(present, `public.businesses is missing ${column}`).toContain(
        column,
      );
    }

    // The seven that should be gone. In production this array would be empty and
    // the assertion would be the whole contract.
    //
    // Sorted on both sides: `MOVED_COLUMNS` is in the order the migration's
    // `drop column` clause lists them, which is not the order the columns sit
    // in, and comparing the two sequences directly would fail for a reason that
    // has nothing to do with what is being asserted.
    expect(
      present.filter((c) => MOVED_COLUMNS.includes(c)).sort(),
      'phase 3 has been applied in this database. businesses should no longer ' +
        'carry these columns, and the tests in this file that describe the ' +
        'pre-phase-3 shape have to be rewritten against the real one.',
    ).toEqual([...MOVED_COLUMNS].sort());

    const failure = KNOWN_REPLAY_FAILURES.find(
      (k) => k.file === '20260927025753_businesses_drop_sensitive_columns.sql',
    );
    expect(
      failure,
      '20260927025753 is no longer in KNOWN_REPLAY_FAILURES. If the replay was ' +
        'fixed, this database now matches production and this whole file needs ' +
        'rewriting — the seven columns, the owner policies and the bootstrap ' +
        'trigger assertions below are all describing a version nobody runs.',
    ).toBeDefined();
    expect(failure?.code).toBe('P0001');
    expect(failure?.msgIncludes).toBe(
      'patron no encontrado en public.reserve_offer',
    );
  });

  /**
   * Every ownership policy on `businesses` still resolves through
   * `businesses.owner_id`, and none of them through `business_ownership`.
   *
   * The same debt, measured where it has consequences. Phase 3 replaced three
   * policies on this table with versions whose predicate is an EXISTS against
   * `business_ownership`, and dropped the three that mention the column. Here the
   * three are still there, still keyed on a column phase 3 intends to delete.
   *
   * Asserted as a COUNT rather than as policy text on purpose. The names, cmds
   * and roles are asserted verbatim in the next test; what this one is about is
   * which column the predicate reaches for, and a count is the form that stays
   * meaningful if a future migration renames a policy. When phase 3 applies this
   * goes to zero and the file must be revisited — which is the point.
   */
  test('every owner policy on businesses resolves ownership through the dropped column, not through business_ownership', async () => {
    const rows = await ctx.sql.unsafe<
      { qual: string | null; with_check: string | null }[]
    >(
      `select qual, with_check from pg_policies
        where schemaname = 'public' and tablename = 'businesses'`,
    );

    const mentionsOwnerId = (value: string | null) =>
      value !== null && /\bowner_id\b/.test(value);
    const mentionsOwnershipTable = (value: string | null) =>
      value !== null && /business_ownership/.test(value);

    const byOwnerColumn = plainRows(rows).filter(
      (r) => mentionsOwnerId(r.qual) || mentionsOwnerId(r.with_check),
    );
    const byOwnershipTable = plainRows(rows).filter(
      (r) =>
        mentionsOwnershipTable(r.qual) || mentionsOwnershipTable(r.with_check),
    );

    // Three policies: view, insert and update. That is the pre-phase-3 set, and
    // it is the whole reason a business owner's access to their own row is keyed
    // on a column that is scheduled for deletion.
    expect(
      byOwnerColumn.length,
      'fewer than three policies on businesses mention owner_id. Phase 3 was ' +
        'applied and the ownership predicates were rewritten; this file has to ' +
        'be rewritten with them.',
    ).toBe(3);
    expect(
      byOwnershipTable.map((r) => r.qual),
      'a policy on businesses already resolves through business_ownership, so the ' +
        'count above is measuring something other than what it says',
    ).toEqual([]);
  });

  /**
   * The full policy set on both tables, asserted as text from the live catalog,
   * because that is the layer under test.
   *
   * Two things about it are worth reading off the list rather than being told.
   *
   * First, there are SEVEN policies here and the brief for this file expected
   * six. The extra one is "Owners can insert own businesses", which phase 3
   * dropped and replaced with "Authenticated can create businesses" — a policy
   * whose `WITH CHECK` is `true`, on the grounds that the bootstrap trigger runs
   * AFTER the row exists and ownership is therefore something the caller cannot
   * express. The replacement does not exist here for the same reason the drop
   * does not: `20260927025753` rolled back. So the policy carrying this file's
   * write surface is the pre-phase-3 one, and it constrains `owner_id =
   * auth.uid()` instead of nothing.
   *
   * Second, no DELETE policy exists on either table and no client role holds
   * DELETE. Two layers, both closed, and the pair is asserted as text precisely
   * so a future migration cannot drop one and leave the other — which would turn
   * a loud refusal into a silent zero-row no-op.
   */
  test('the policy set is five read/write policies on businesses and two on ownership, unmodified', async () => {
    const rows = await ctx.sql.unsafe<
      {
        tablename: string;
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
      }[]
    >(
      `select tablename, policyname, cmd, permissive, roles
         from pg_policies
        where schemaname = 'public'
          and tablename in ('businesses', 'business_ownership')
        order by tablename, policyname`,
    );

    expect(plainRows<Record<string, unknown>>(rows)).toEqual([
      {
        tablename: 'business_ownership',
        policyname: 'Admins can view all business ownership',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'business_ownership',
        policyname: 'Owners can view own business ownership',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'businesses',
        policyname: 'Admins full access on businesses',
        cmd: 'ALL',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'businesses',
        policyname: 'Anyone can view active businesses',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
      {
        tablename: 'businesses',
        policyname: 'Owners can insert own businesses',
        cmd: 'INSERT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'businesses',
        policyname: 'Owners can update own businesses',
        cmd: 'UPDATE',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        tablename: 'businesses',
        policyname: 'Owners can view own businesses',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['public'],
      },
    ]);

    // Said a second way, so a new write policy fails on a one-line diff rather
    // than inside a seven-element array. The command list is spelled out rather
    // than written as `cmd <> 'SELECT'`, because "Admins full access on
    // businesses" is `FOR ALL` and would land in a negated filter — turning an
    // assertion about CLIENT write policies into one that also reports the admin
    // policy's existence, and would then fail the day phase 3 is applied for a
    // reason the reader would have to unpick.
    const writePolicies = await ctx.sql.unsafe<
      { tablename: string; policyname: string }[]
    >(
      `select tablename, policyname
         from pg_policies
        where schemaname = 'public'
          and tablename in ('businesses', 'business_ownership')
          and cmd in ('INSERT', 'UPDATE', 'DELETE')`,
    );
    expect(
      plainRows(writePolicies)
        .map((p) => `${p.tablename}:${p.policyname}`)
        .sort(),
      'the write policy set on the businesses tables changed',
    ).toEqual([
      'businesses:Owners can insert own businesses',
      'businesses:Owners can update own businesses',
    ]);
  });

  /**
   * Creating a business writes NO ownership row, because the trigger that would
   * is one of the seven replay failures away.
   *
   * In production `trg_bootstrap_business_companions` runs AFTER INSERT and
   * writes `business_ownership`, `business_finance` and `business_moderation` for
   * every new business. It is AFTER and not BEFORE because the companions carry
   * foreign keys to `businesses(id)` that are validated immediately — a BEFORE
   * trigger runs before the parent row exists and fails with `23503`. That was
   * found by running the flow rather than by reading the code, and it is why the
   * INSERT policy had to stop checking ownership at the same time.
   *
   * The trigger list below is asserted in full, so its ABSENCE is pinned: a
   * future migration that creates it makes this test fail and the rest of the
   * file start describing production.
   */
  test('a client-created business writes no ownership row, and the bootstrap trigger is absent', async () => {
    const triggers = await ctx.sql.unsafe<{ tgname: string; def: string }[]>(
      `select t.tgname, pg_get_triggerdef(t.oid, true) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'businesses'
          and not t.tgisinternal
        order by t.tgname`,
    );

    expect(plainRows(triggers).map((t) => t.tgname)).toEqual([
      'set_businesses_updated_at',
      'trg_create_business_notification_preferences',
      'trg_default_business_inactive',
      'trg_notify_business_pending',
      'trg_notify_business_verification',
      'trg_set_business_owner_from_jwt',
      'trg_sync_business_verification',
    ]);

    // A real client insert, committed, then read as the schema owner.
    const created = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ id: string; slug: string }[]>(
        `insert into public.businesses (name, slug, type) values ('RLS businesses orphan', 'rls-biz-orphan', 'restaurant')
         returning id::text, slug`,
      ),
    );
    const businessId = plainRows(created)[0]?.id as string;
    expect(businessId, 'the client insert did not return an id').toBeDefined();

    const ownership = await ctx.sql.unsafe<{ business_id: string }[]>(
      `select business_id::text from public.business_ownership where business_id = '${businessId}'`,
    );
    expect(
      plainRows(ownership),
      'a client-created business has an ownership row. trg_bootstrap_business_' +
        'companions now exists, phase 3 landed in this database, and this file ' +
        'has to be rewritten against the real behaviour.',
    ).toEqual([]);

    // The BEFORE trigger DID run and did fill `businesses.owner_id` from the JWT,
    // so ownership is still not something the caller expressed — it just is not
    // in the companion table yet.
    const row = await ctx.sql.unsafe<{ owner_id: string }[]>(
      `select owner_id::text from public.businesses where id = '${businessId}'`,
    );
    expect(row[0]?.owner_id).toBe(MEMBER);
  });

  /**
   * The caller cannot claim somebody else's business in the insert body, and the
   * refusal here is a POLICY — unlike every other write refusal in this file.
   *
   * Worth its own test because this is the one place on `businesses` where RLS,
   * not the ACL, is doing the work, and getting the two confused in the other
   * direction is just as damaging as the reverse. `owner_id` IS in the
   * client INSERT grant, precisely so the NOT NULL column can be satisfied; what
   * stops a caller from pointing it at a stranger is
   * "Owners can insert own businesses"'s `WITH CHECK (owner_id = auth.uid())`.
   *
   * The two positive cases are asserted in the same loop so the pair reads as one
   * rule: naming yourself works, naming somebody else does not, and omitting it
   * works because `trg_set_business_owner_from_jwt` fills it from the JWT. In
   * production phase 3 removes the column and the policy's `WITH CHECK` with it,
   * which is safe only because the caller then has no way to express ownership
   * at all — the reason that migration is a drop and not a grant removal.
   */
  test('a caller cannot claim another account’s business in the insert body', async () => {
    const claimOther = await deniedAs(ctx.sql, 'authenticated', OWNER_A, (tx) =>
      tx.unsafe(
        `insert into public.businesses (name, slug, type, owner_id)
         values ('RLS businesses impostor', 'rls-biz-impostor', 'restaurant', '${OWNER_B}')
         returning id`,
      ),
    );

    expect(
      claimOther,
      'a caller claimed a business for another account',
    ).not.toBeNull();
    expect(claimOther?.code).toBe('42501');
    // The policy layer, named as such, and NOT the table grant.
    expect(claimOther?.message).toContain(
      'new row violates row-level security policy for table "businesses"',
    );
    expect(
      claimOther?.message,
      'the refusal was a table grant rather than the INSERT policy. Either the ' +
        'column grant was revoked — in which case the client cannot create a ' +
        'business at all — or the policy was widened.',
    ).not.toBe('permission denied for table businesses');

    // Nothing was written, read as the schema owner.
    const leaked = await ctx.sql.unsafe<{ slug: string }[]>(
      `select slug from public.businesses where slug = 'rls-biz-impostor'`,
    );
    expect(plainRows(leaked)).toEqual([]);

    // The two admitted shapes, so the test above is a boundary and not a wall.
    for (const [label, ownerClause] of [
      ['naming itself', `'${OWNER_A}'`],
      ['omitting it, letting the trigger fill it from the JWT', 'null'],
    ] as const) {
      const slug = ownerClause === 'null' ? 'rls-biz-omitted' : 'rls-biz-self';
      const columns =
        ownerClause === 'null'
          ? 'name, slug, type'
          : 'name, slug, type, owner_id';
      const values =
        ownerClause === 'null'
          ? `'RLS businesses ${label}', '${slug}', 'restaurant'`
          : `'RLS businesses ${label}', '${slug}', 'restaurant', '${OWNER_A}'`;

      const inserted = await as(ctx.sql, 'authenticated', OWNER_A, (tx) =>
        tx.unsafe<{ owner_id: string }[]>(
          `insert into public.businesses (${columns}) values (${values}) returning owner_id::text`,
        ),
      );
      expect(
        plainRows(inserted).map((r) => r.owner_id),
        `an insert ${label} did not land owned by the caller`,
      ).toEqual([OWNER_A]);
    }
  });
});

describe('the boundary between tenants', () => {
  /**
   * The owner of A does not read B's business, and the way it does not is the
   * interesting part: it matches ZERO ROWS and returns no error.
   *
   * `deniedAs` returning `null` here does not mean the write succeeded. It means
   * no exception was raised, and on a table with column-level UPDATE a statement
   * whose policy filters every row out is indistinguishable from a successful one
   * to any caller that checks for an error instead of a row count. This is the
   * same trap the pilot documents on `categories` and it is why the assertion
   * below is on the row, re-read as the schema owner, and not on the absence of
   * a throw.
   *
   * The mechanism is the OR of two PERMISSIVE policies. "Anyone can view active
   * businesses" is `TO public` and holds for `BIZ_A`; "Owners can view own
   * businesses" is `owner_id = auth.uid()` and holds only for the caller's own.
   * For `BIZ_B` the first evaluates false and the second false, and the row goes.
   */
  test('the owner of A sees its own business and not B’s', async () => {
    expect(await visibleSlugs(ctx.sql, 'authenticated', OWNER_A)).toEqual([
      SLUG_A,
    ]);
    // And the control, because the contrast has to be a boundary and not a wall:
    // an active business that A does not own IS legitimately visible through the
    // public policy, which is the whole catalog and is not a leak.
    expect(await visibleSlugs(ctx.sql, 'authenticated', OWNER_B)).toEqual([
      SLUG_A,
      SLUG_B,
      SLUG_C,
    ]);
  });

  /**
   * The owner of A does not update B's business. Zero rows, no error, B unchanged.
   *
   * "Owners can update own businesses" is `USING (owner_id = auth.uid())`, so the
   * row is filtered out before the statement ever looks at a column. Note that
   * this refusal would be identical with and without the column grants, because
   * RLS is consulted for the rows the statement is allowed to touch — which is
   * exactly why the row-count assertion below and the grant assertion above are
   * both needed: each proves something the other cannot.
   */
  test('the owner of A does not update B’s business, and the refusal is silent', async () => {
    const before = await ctx.sql.unsafe<{ name: string; updated_at: string }[]>(
      `select name, updated_at::text from public.businesses where id = '${BIZ_B}'`,
    );

    const affected = await as(ctx.sql, 'authenticated', OWNER_A, (tx) =>
      tx
        .unsafe<{ id: string }[]>(
          `update public.businesses set name = 'hijacked by A' where id = '${BIZ_B}' returning id::text`,
        )
        .then((rows) => rows.map((r) => r.id)),
    );

    // No exception — `as()` rethrows, so a policy error here fails the test with
    // its own message and the assertion below is only ever reached when the
    // statement SUCCEEDED. That is the surprising half: this denial is invisible
    // to a client that checks for an error and not for a row count.
    //
    // The only evidence, and it is what a real caller has to look at:
    expect(affected, 'the cross-tenant UPDATE returned a row').toEqual([]);

    const after = await ctx.sql.unsafe<{ name: string; updated_at: string }[]>(
      `select name, updated_at::text from public.businesses where id = '${BIZ_B}'`,
    );
    expect(after).toEqual(before);
    expect(after[0]?.name).toBe('RLS businesses B');

    // And B can still write to it, which is what makes the zero rows above a
    // policy result rather than a broken fixture.
    const ownWrite = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
      tx.unsafe<{ name: string }[]>(
        `update public.businesses set name = 'renamed by B' where id = '${BIZ_B}' returning name`,
      ),
    );
    expect(plainRows(ownWrite).map((r) => r.name)).toEqual(['renamed by B']);
  });

  /**
   * The owner of A does not read B's ownership row, and a non-admin member reads
   * none at all.
   *
   * `business_ownership` is where phase 3 is going to put every ownership
   * predicate, so its isolation is not a side note: it becomes the thing every
   * `Owners can …` policy on offers, orders, coupons, payouts, locations, hours,
   * notification preferences and payment intents will delegate to. A leak here is
   * not one row, it is the ownership half of the entire authorisation model.
   *
   * The grant is `SELECT` for `authenticated` and nothing for `anon`, and the
   * assertions are on the exact sets rather than on spot checks, because the
   * interesting failure is a policy that is subtly wider than it looks — for
   * instance one that reached `businesses` instead of its own `owner_id`, and
   * therefore granted every business to whoever could read the catalog.
   */
  test('business_ownership isolates tenants, and an admin is the only role that sees them all', async () => {
    expect(await visibleOwnership(ctx.sql, 'authenticated', OWNER_A)).toEqual([
      BIZ_A,
    ]);
    expect(await visibleOwnership(ctx.sql, 'authenticated', OWNER_B)).toEqual([
      BIZ_B,
    ]);
    expect(await visibleOwnership(ctx.sql, 'authenticated', MEMBER)).toEqual(
      [],
    );

    // The contrast that proves the admin policy is alive, in the same session
    // role, on the same table, with only `auth_helpers.my_role()` able to produce
    // the difference. Postgres does not error on a false qual and does not need a
    // true one, so a policy that evaluates to false is indistinguishable, to a
    // member, from one that was never reached — which is why the "sees more"
    // half has to be asserted rather than assumed.
    const asAdmin = await visibleOwnership(ctx.sql, 'authenticated', ADMIN);
    const asMember = await visibleOwnership(ctx.sql, 'authenticated', MEMBER);
    expect(
      asAdmin,
      'an admin reads fewer ownership rows than a member',
    ).not.toEqual(asMember);
    expect(asAdmin).toEqual([BIZ_A, BIZ_B]);

    // A member holding nothing is a different result from an admin holding
    // everything, produced by the same statement. Asserted in the same place as
    // the ownership set rather than as a separate test, because the whole claim
    // is the contrast: the admin policy is the ONLY thing that can widen this
    // table for a signed-in role.
    expect(asMember).toEqual([]);

    // And `anon` is closed a layer earlier, so the two "nothing" answers are not
    // the same fact. A member gets an empty set from two policies that were both
    // evaluated and both false; `anon` never reaches a policy at all.
    const anonDenial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`select business_id::text from public.business_ownership`),
    );
    expect(anonDenial, 'anon read the ownership table').not.toBeNull();
    expect(anonDenial?.message).not.toContain('row-level security policy');
  });

  /**
   * Nobody can insert into `business_ownership` to claim a business, and the
   * refusal is the GRANT — which is independent of the policy in a way worth
   * being precise about.
   *
   * `20260925225227` runs `revoke all on public.business_ownership from anon,
   * authenticated` and grants back only SELECT, and the table has no INSERT,
   * UPDATE or DELETE policy to bypass. Both layers are closed, and this test
   * asserts both: the catalog shows the write privileges are absent, and the
   * statements are refused with a message that names the table rather than a
   * policy. If a future migration granted INSERT to `authenticated` without
   * adding a policy, the ACL half of this test fails and the denial half starts
   * reporting `row-level security policy` instead — which is a different and much
   * more interesting failure, so the message shape is pinned.
   *
   * The claim is aimed at `BIZ_C`, which has no ownership row, so the primary
   * key can never be the reason for the refusal. A caller that could write here
   * would be able to take over any business on the platform, including one that
   * does not exist in the table yet.
   */
  test('nobody can claim a business by writing its ownership row, and the grant is what stops them', async () => {
    const privileges = await ctx.sql.unsafe<
      { grantee: string; privilege_type: string }[]
    >(
      `select grantee, privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'business_ownership'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type`,
    );
    expect(
      plainRows(privileges).map((p) => `${p.grantee}:${p.privilege_type}`),
    ).toEqual(['authenticated:SELECT']);

    for (const [label, role, userId] of [
      ['anon', 'anon', null],
      ['a member', 'authenticated', MEMBER],
      ['the owner of another business', 'authenticated', OWNER_A],
      ['an admin', 'authenticated', ADMIN],
    ] as const) {
      for (const [verb, statement] of [
        [
          'insert',
          `insert into public.business_ownership (business_id, owner_id) values ('${BIZ_C}', '${OWNER_A}')`,
        ],
        [
          'update',
          `update public.business_ownership set owner_id = '${OWNER_A}' where business_id = '${BIZ_B}' returning business_id`,
        ],
        [
          'delete',
          `delete from public.business_ownership where business_id = '${BIZ_B}' returning business_id`,
        ],
      ] as const) {
        const denial = await deniedAs(ctx.sql, role, userId, (tx) =>
          tx.unsafe(statement),
        );

        expect(
          denial,
          `${label} was able to ${verb} an ownership row`,
        ).not.toBeNull();
        expect(denial?.code).toBe('42501');
        expect(denial?.message).toContain(
          'permission denied for table business_ownership',
        );
        expect(denial?.message).not.toContain('row-level security policy');
        // The primary key cannot be the cause: BIZ_C has no row, and the
        // references below are the control for that.
        expect(denial?.message).not.toContain('duplicate key');
      }
    }

    const unchanged = await ctx.sql.unsafe<
      { business_id: string; owner_id: string }[]
    >(
      `select business_id::text, owner_id::text from public.business_ownership order by business_id`,
    );
    expect(
      plainRows(unchanged).map((r) => `${r.business_id}/${r.owner_id}`),
    ).toEqual([`${BIZ_A}/${OWNER_A}`, `${BIZ_B}/${OWNER_B}`]);
  });
});

describe('self-approval and the public catalog', () => {
  /**
   * A business a client creates is inactive and pending, and the caller does not
   * get to say so.
   *
   * Three mechanisms, all asserted, because any one of them alone would leave the
   * business visible in the catalog:
   *
   *   1. the column grants do not include `is_active` or `verification_status`,
   *      so naming either is a 42501 (the grant test above);
   *   2. `trg_default_business_inactive` forces `is_active := false` unless the
   *      incoming value is exactly false;
   *   3. `trg_sync_business_verification` then re-derives `is_active` from
   *      `verification_status`, which is NOT NULL and defaults to `'pending'`.
   *
   * The two BEFORE triggers run in name order and the second one wins, which is
   * why mechanism 2 cannot be described as the thing that holds the line — the
   * next test is the one that proves it does not. What this test pins is the
   * OBSERVABLE contract: a business that nobody has approved is not published.
   */
  test('a client-created business lands inactive and pending, and the caller cannot say otherwise', async () => {
    const created = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ is_active: boolean; verification_status: string }[]>(
        `insert into public.businesses (name, slug, type) values ('RLS businesses fresh', 'rls-biz-fresh', 'restaurant')
         returning is_active, verification_status::text`,
      ),
    );

    // Read from the returned row rather than asserted from the INSERT, because
    // the INSERT did not mention either column and the whole point is what the
    // trigger chain decided.
    expect(plainRows(created)).toEqual([
      { is_active: false, verification_status: 'pending' },
    ]);

    // And the catalog agrees: nothing that was just created is in it.
    const published = await visibleSlugs(ctx.sql, 'anon', null);
    expect(published).not.toContain('rls-biz-fresh');

    // Naming either column is refused, with the layer named. Restated here
    // because on a NEW row the two refusals are the only thing between a client
    // and a business that appears in the public catalog on its first write.
    for (const [column, value] of [
      ['is_active', 'true'],
      ['verification_status', "'approved'"],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(
          `insert into public.businesses (name, slug, type, ${column})
           values ('RLS businesses escalate', 'rls-biz-escalate', 'restaurant', ${value})`,
        ),
      );
      expect(denial, `a client set ${column} on insert`).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain(
        'permission denied for table businesses',
      );
      expect(denial?.message).not.toContain('row-level security policy');
    }

    const leaked = await ctx.sql.unsafe<{ slug: string }[]>(
      `select slug from public.businesses where slug = 'rls-biz-escalate'`,
    );
    expect(plainRows(leaked)).toEqual([]);
  });

  /**
   * An owner cannot set `is_active` or `verification_status` on its own business.
   * The GRANT refuses, and the assertion says so — but the grant is one layer,
   * and this test is the first half of the two-layer question.
   *
   * A `returning` clause is used on purpose. An UPDATE that names a column the
   * role holds no privilege on is refused before RLS is consulted, so the message
   * carries the table grant and NOT a policy error; asserting the absence of
   * `row-level security policy` is what keeps the claim pinned to the layer that
   * produced it, in the same way the cross-tenant test above is pinned to a row
   * count.
   */
  test('an owner cannot set is_active or verification_status on its own business', async () => {
    for (const [column, value] of [
      ['is_active', 'true'],
      ['verification_status', "'approved'"],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx.unsafe(
          `update public.businesses set ${column} = ${value} where id = '${BIZ_B}' returning id`,
        ),
      );

      expect(
        denial,
        `an owner set ${column} on its own business`,
      ).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain(
        'permission denied for table businesses',
      );
      expect(denial?.message).not.toContain('row-level security policy');
    }

    // Unchanged, read as the schema owner.
    const state = await ctx.sql.unsafe<
      { is_active: boolean; verification_status: string }[]
    >(
      `select is_active, verification_status::text from public.businesses where id = '${BIZ_B}'`,
    );
    expect(state[0]).toEqual({
      is_active: false,
      verification_status: 'pending',
    });
  });

  /**
   * THE TRIGGER IS NOT A LAYER. It is an amplifier — and that has not changed.
   *
   * The previous test shows the column grant refusing. This one asks the
   * question that test cannot: if somebody gave the grant back, would anything
   * else stop the escalation? The grant is temporarily restored inside the test,
   * the escalation is performed, the truth is asserted, and the grant is
   * removed again in a `finally` with a re-assertion that it is gone.
   *
   * ─── What this test concluded BEFORE 20260928101500, and what it concludes now ──
   *
   * The escalation reached the catalog. The grant was the only layer, because
   * "Anyone can view active businesses" said `is_active = true` and nothing
   * else. That is the finding this file was written to record, and the policy
   * text of that era is quoted in this comment on purpose: it is the thing the
   * migration changed, and a test that quietly forgets what it used to prove is
   * a test that stops being evidence.
   *
   * The escalation STILL reaches the ROW. That is unchanged and is asserted
   * below exactly as it was — the trigger still derives `is_active`, and an
   * INSERT still lands ACTIVE. What changed is the second half: the catalog no
   * longer follows, because the policy now asks
   * `public.business_is_approved(businesses.id)` and the answer is read from
   * `business_moderation`, which this escalation never writes.
   *
   * ─── Why the test is still worth having, and is not now redundant ─────────
   *
   * Because it is the one measurement that distinguishes the two layers. Every
   * other test in this file grants nothing and so cannot tell "the grant holds
   * the line" from "the policy holds the line" — with the grant in place, both
   * produce the same empty result for a client. Restoring it removes the grant
   * from the picture and leaves the policy alone, which is the only way to show
   * the policy is carrying the invariant on its own.
   *
   * It is also the test that catches the failure mode this migration is most
   * exposed to. A future migration that re-grants table-wide UPDATE on
   * `businesses` — the shape `20260925224820` already shipped once for SELECT —
   * re-opens every door below, and this test is what turns that from a silent
   * widening into a red assertion.
   *
   * ─── What actually happens, on UPDATE ─────────────────────────────────────
   *
   * `trg_sync_business_verification` is `BEFORE INSERT OR UPDATE OF
   * verification_status`. An UPDATE whose SET list does not mention
   * `verification_status` never fires it. So `update … set is_active = true`
   * goes straight through, with no policy consulted beyond ownership, and the
   * business is active with `verification_status = 'pending'` still on it.
   *
   * ─── And on UPDATE through the other door ─────────────────────────────────
   *
   * Setting `verification_status = 'approved'` fires the trigger, and the
   * phase-2 version of that trigger DERIVES `is_active` from the status — so the
   * escalation completes itself on the row. The trigger is not a check; it is the
   * propagation mechanism that makes the moderation flow work, and it has no
   * idea who is asking.
   *
   * This door is also where the gate's design shows itself. In this database the
   * escalated row carries `verification_status = 'approved'` ON THE ROW and is
   * still invisible, because the policy does not read that column — it reads
   * `business_moderation`, where this write never lands. The policy consults the
   * source, not the copy, and a self-approved copy is exactly what the copy
   * approach would have published.
   *
   * ─── And on INSERT ────────────────────────────────────────────────────────
   *
   * `trg_default_business_inactive` and `trg_sync_business_verification` are both
   * BEFORE INSERT and run in name order, so the derive trigger runs second and
   * wins. An INSERT carrying `verification_status = 'approved'` lands ACTIVE.
   * That is the correct behaviour for the API, which is what writes that column —
   * it is approving a business on purpose. It is also, from the client's side, a
   * single self-approving statement.
   *
   * ─── WHAT NOT TO DO ───────────────────────────────────────────────────────
   *
   * Do not add these grants to `PLATFORM_GRANTS_AFTER_REPLAY` in
   * `test/supabase-platform.ts` to make the demonstration stop. That array is
   * documented as having already been used exactly that way, with a
   * `grant usage on schema auth_helpers` that made the pilot assert a privilege
   * production does not have. The grants here are granted and revoked INSIDE the
   * probe, in a transaction the test controls, on a per-file throwaway database,
   * and the test asserts they are absent both before and after. That is a
   * measurement. Moving them to the harness would make it a fiction.
   */
  test('with the write grant restored the trigger still escalates the row, and the policy no longer lets the escalation reach the catalog', async () => {
    // The barrier, asserted first so that a failure below points at the cause.
    const before = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
      tx.unsafe<{ ins: boolean; upd: boolean }[]>(`
        select has_column_privilege('authenticated', 'public.businesses', 'is_active',          'insert') as ins,
               has_column_privilege('authenticated', 'public.businesses', 'is_active',          'update') as upd`),
    );
    expect(
      before[0],
      'the client already holds a write grant on is_active',
    ).toEqual({
      ins: false,
      upd: false,
    });

    await ctx.sql.unsafe(
      `grant update (is_active, verification_status) on table public.businesses to authenticated`,
    );
    /**
     * The state reset lives in the `finally`, not inline after each probe, and
     * that is not tidiness. The first draft of this test reset between the two
     * probes, so a failure inside the first one — which is the interesting
     * failure — left `BIZ_B` active and every test after it measured this probe
     * instead of the ledger. A measurement that corrupts the measurements around
     * it is worse than no measurement, because the failures it causes look like
     * findings.
     */
    try {
      // Door one: the moderation column is not in the SET list, so
      // `trg_sync_business_verification` never fires and nothing re-derives
      // anything. The row goes active while still pending.
      //
      // `as()` and not `deniedAs()`: an error rethrows and fails the test with
      // the server's own message, so reaching the assertions at all IS the proof
      // that the statement was allowed. Wrapping it in `deniedAs` would put the
      // allowed case in the branch that reads as "something went wrong".
      const direct = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx
          .unsafe<{ is_active: boolean; verification_status: string }[]>(
            `update public.businesses set is_active = true where id = '${BIZ_B}'
             returning is_active, verification_status::text`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(direct).toEqual([
        { is_active: true, verification_status: 'pending' },
      ]);

      // And the catalog does NOT follow. The row is active and unapproved, which
      // used to be exactly the state that published it; the policy now asks the
      // moderation table, where this write never landed.
      const catalog = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ slug: string; verification_status: string }[]>(
            `select slug, verification_status::text from public.businesses
              where slug = '${SLUG_B}' and is_active = true`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(
        catalog,
        'the unapproved business reached the anonymous catalog WITH the write ' +
          'grant restored. The column grant is holding the line again, which is ' +
          'the whole failure this migration exists to remove — the policy gate ' +
          'has stopped applying.',
      ).toEqual([]);

      // Reset between the two doors so they are independent measurements, not a
      // sequence in which the second one inherits the first one's state.
      await ctx.sql.unsafe(
        `update public.businesses set is_active = false, verification_status = 'pending' where id = '${BIZ_B}'`,
      );

      // Door two: the moderation column IS in the SET list, so the trigger fires
      // and the escalation completes itself. The trigger that makes moderation
      // work for the API is the same trigger that carries the escalation through.
      const viaStatus = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx
          .unsafe<{ is_active: boolean; verification_status: string }[]>(
            `update public.businesses set verification_status = 'approved' where id = '${BIZ_B}'
             returning is_active, verification_status::text`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(viaStatus).toEqual([
        { is_active: true, verification_status: 'approved' },
      ]);

      // Door three, on insert: both BEFORE triggers run, the derive one second,
      // and the body of the INSERT decides the result.
      await ctx.sql.unsafe(
        `grant insert (name, slug, type, verification_status) on table public.businesses to authenticated`,
      );
      const escalated = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx
          .unsafe<
            { slug: string; is_active: boolean; verification_status: string }[]
          >(
            `insert into public.businesses (name, slug, type, verification_status)
             values ('RLS businesses self approved', 'rls-biz-self-approved', 'restaurant', 'approved')
             returning slug, is_active, verification_status::text`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(escalated).toEqual([
        {
          slug: 'rls-biz-self-approved',
          is_active: true,
          verification_status: 'approved',
        },
      ]);

      // Door three's result, in the catalog: still nothing. The row says
      // `approved` and `is_active = true` — a self-approving statement, from a
      // client, that got all the way through — and it is not published, because
      // there is no `business_moderation` row for it and the policy reads that
      // table rather than the row's own copy of the status.
      //
      // This is the sharpest form of the whole migration. In production the
      // client could not write `verification_status` at all, since phase 3 moved
      // the column; here it can, and the row still stays out. The gate does not
      // depend on the column being unwritable.
      const selfApproved = await as(ctx.sql, 'anon', null, (tx) =>
        tx
          .unsafe<{ slug: string }[]>(
            `select slug from public.businesses where slug = 'rls-biz-self-approved'`,
          )
          .then((rows) => plainRows(rows)),
      );
      expect(
        selfApproved,
        'a self-approved business reached the anonymous catalog. The policy is ' +
          'reading a column on the row rather than the moderation table, so a ' +
          'client that can write the column controls its own visibility.',
      ).toEqual([]);
    } finally {
      /**
       * Order matters here, and the first draft of this block had it backwards.
       *
       * A `finally` stops at its first throw, so a cleanup statement that can
       * fail must not come before the ones that restore the database's state.
       * Deleting the probe business was that statement: `trg_create_business_
       * notification_preferences` is an AFTER INSERT trigger, so the INSERT above
       * created a child row, and `business_notification_preferences.business_id`
       * has no ON DELETE CASCADE — the DELETE raised `23503`, the rest of the
       * block never ran, and the three tests after this one all failed because a
       * pending business was left active and the escalation grant was left in
       * place. The probe looked like it had broken the policies.
       *
       * So: the revokes and the row reset go first, and the cosmetic cleanup goes
       * last and is written to succeed.
       */
      await ctx.sql.unsafe(
        `revoke insert (verification_status) on table public.businesses from authenticated`,
      );
      await ctx.sql.unsafe(
        `revoke update (is_active, verification_status) on table public.businesses from authenticated`,
      );
      await ctx.sql.unsafe(
        `update public.businesses set is_active = false, verification_status = 'pending' where id = '${BIZ_B}'`,
      );
      // The child rows the AFTER INSERT triggers created, then the business.
      // `trg_create_business_notification_preferences` is why the FK bites, and
      // the delete is scoped by slug through a subquery so it cannot touch a row
      // another test made.
      await ctx.sql.unsafe(
        `delete from public.business_notification_preferences
          where business_id = (select id from public.businesses where slug = 'rls-biz-self-approved')`,
      );
      await ctx.sql.unsafe(
        `delete from public.businesses where slug = 'rls-biz-self-approved'`,
      );
    }

    // The grants are gone again. Asserted, not assumed: a `revoke` that was a
    // no-op here would silently reopen the escalation for every test after this
    // one, which is the same class of bug as a fixture that is not what it says.
    const after = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_column_privilege('authenticated', 'public.businesses', 'is_active',            'insert') as i_is_active,
               has_column_privilege('authenticated', 'public.businesses', 'is_active',            'update') as u_is_active,
               has_column_privilege('authenticated', 'public.businesses', 'verification_status', 'insert') as i_status,
               has_column_privilege('authenticated', 'public.businesses', 'verification_status', 'update') as u_status`),
    );
    expect(
      after[0],
      'the probe left a write grant behind on businesses',
    ).toEqual({
      i_is_active: false,
      u_is_active: false,
      i_status: false,
      u_status: false,
    });

    // And the real invariant is intact after the probe: the catalog holds the
    // one approved, active business and nothing else. Scoped to the three seeded
    // slugs, so the probe rows this file created are outside the comparison even
    // if one of them leaked.
    const catalog = await as(ctx.sql, 'anon', null, (tx) =>
      tx
        .unsafe<{ slug: string; verification_status: string }[]>(
          `select slug, verification_status::text from public.businesses
            where slug in ('${SEEDED_SLUGS.join("', '")}') and is_active = true
            order by slug`,
        )
        .then((rows) => plainRows(rows)),
    );
    expect(catalog).toEqual([
      { slug: SLUG_A, verification_status: 'approved' },
    ]);
  });

  /**
   * `anon` sees the active businesses and not the others. Scoped to this file's
   * own rows, the way every exact assertion in these specs is, so a future seed
   * migration cannot turn it into a failure.
   *
   * "Anyone can view active businesses" is the ONLY policy that reaches `anon`
   * on this table: it is `TO public`, it is `FOR SELECT`, and the other four
   * policies are `TO authenticated` with an `auth.uid()` or `my_role()` predicate
   * that is false — or NULL, for `anon` — under a request with no JWT. So the
   * catalog is exactly what that one policy admits, and the assertion is a
   * complete statement about what an anonymous visitor can read.
   *
   * It is ALSO the control for the gate block: on this fixture every seeded
   * business is either inactive or approved, so the answer is the same under
   * `is_active = true` alone. The gate's own effect is only observable on a row
   * that is active AND unapproved, which is why the block below builds one
   * rather than relying on the seed to contain it.
   */
  test('anon sees the active businesses and not the inactive ones', async () => {
    const slugs = await visibleSlugs(ctx.sql, 'anon', null);

    expect(slugs).toEqual([SLUG_A]);
    expect(slugs).not.toContain(SLUG_B);
    expect(slugs).not.toContain(SLUG_C);

    // The three rows really are in the table with those two columns, so the
    // assertion above is a policy result and not an empty fixture.
    const state = await ctx.sql.unsafe<
      { slug: string; is_active: boolean; verification_status: string }[]
    >(
      `select slug, is_active, verification_status::text
         from public.businesses
        where slug in ('${SEEDED_SLUGS.join("', '")}')
        order by slug`,
    );
    expect(plainRows(state)).toEqual([
      { slug: SLUG_A, is_active: true, verification_status: 'approved' },
      { slug: SLUG_B, is_active: false, verification_status: 'pending' },
      { slug: SLUG_C, is_active: false, verification_status: 'pending' },
    ]);
  });

  /**
   * ─── THE ANSWER TO THE QUESTION THIS FILE WAS ASKED TO MEASURE, AND THE
   * ─── ANSWER AFTER 20260928101500 ──────────────────────────────────────────
   *
   * This test used to assert the opposite of what it asserts now, and the old
   * claim is recorded here rather than deleted, because a test that forgets what
   * it used to prove is a test that has quietly stopped being evidence.
   *
   * ─── WHAT IT FOUND ────────────────────────────────────────────────────────
   *
   * A business that is `is_active = true` while `verification_status` is still
   * `pending` WAS in the anonymous catalog, legible with every column including
   * the pending status. The write was one column, and that was the whole
   * finding: `trg_sync_business_verification` is `BEFORE INSERT OR UPDATE OF
   * verification_status`, so a statement that does not mention
   * `verification_status` never fires it, nothing re-derives `is_active`, and
   * "Anyone can view active businesses" was the entire predicate — it did not
   * know what `is_active` meant.
   *
   * So the invariant was held by the COLUMN GRANT, in one layer, on one table.
   * Not by a trigger on UPDATE, and not by a policy at all.
   *
   * ─── WHY THAT WAS LATENT RATHER THAN LIVE, AND WHY IT WAS STILL A FINDING ───
   *
   * Every writer that could set `is_active` was a trusted one — the API, as
   * schema owner or `service_role` — and every such writer went through the
   * moderation flow that sets the status first. What made it worth a test
   * rather than a note is that the guarantee was one `GRANT` away from changing
   * shape, and the ledger has already shipped a migration that hands
   * `authenticated` table-wide grants on this very table.
   *
   * ─── WHAT CHANGED, AND WHAT THIS NOW ASSERTS ──────────────────────────────
   *
   * 20260928101500 added `and public.business_is_approved(businesses.id)` to the
   * policy, so the same row is now invisible. The measurement below is
   * deliberately UNCHANGED — same write, same role, same single column, same
   * re-read — and only the expected answer moved. That is what makes it a
   * before/after pair rather than two unrelated tests: the fixture, the write
   * and the read are all identical, so the difference in the result is
   * attributable to the policy and nothing else.
   *
   * The UPDATE is committed and then undone in a `finally`, so the measurement
   * leaves no state for the tests that follow.
   */
  test('a business that is active but NOT approved is no longer in the public catalog, and the policy is what keeps it out', async () => {
    // Precondition, re-read rather than trusted from the seed.
    const before = await ctx.sql.unsafe<
      { is_active: boolean; verification_status: string }[]
    >(
      `select is_active, verification_status::text from public.businesses where id = '${BIZ_C}'`,
    );
    expect(before[0]).toEqual({
      is_active: false,
      verification_status: 'pending',
    });

    // The measurement. `is_active` alone, written by a role that is not a client
    // role and has no reason to be careful, which is exactly the situation the
    // missing policy would not notice.
    await ctx.sql.unsafe(
      `update public.businesses set is_active = true where id = '${BIZ_C}'`,
    );
    try {
      // Still pending. The trigger did not fire and did not correct it.
      const row = await ctx.sql.unsafe<
        { is_active: boolean; verification_status: string }[]
      >(
        `select is_active, verification_status::text from public.businesses where id = '${BIZ_C}'`,
      );
      expect(row[0]).toEqual({
        is_active: true,
        verification_status: 'pending',
      });

      // And the companion, which is where the moderation state lives in
      // production, is empty for this business. This is what the new policy
      // reads, and an absent row is a false answer: the gate fails closed. The
      // companion is also the reason the policy can be written at all without
      // granting anything — the table is unreadable to every client role BY
      // GRANT, which is what makes it a trustworthy anchor.
      const moderation = await ctx.sql.unsafe<{ business_id: string }[]>(
        `select business_id::text from public.business_moderation where business_id = '${BIZ_C}'`,
      );
      expect(plainRows(moderation)).toEqual([]);

      // The answer, reversed. An anonymous browser reads zero rows, and no
      // error: a policy filtering a row out and a policy that was never reached
      // are indistinguishable from here, which is why the policy's text and its
      // dependency on the helper are asserted separately in the gate block.
      const visible = await as(ctx.sql, 'anon', null, (tx) =>
        tx.unsafe<
          { slug: string; is_active: boolean; verification_status: string }[]
        >(
          `select slug, is_active, verification_status::text from public.businesses
            where id = '${BIZ_C}'`,
        ),
      );
      expect(
        plainRows(visible),
        'the active-but-unapproved business IS in the anonymous catalog. The ' +
          'moderation gate is not applying, which means the column grant is ' +
          'carrying the invariant again on its own — the condition this ' +
          'migration was written to remove.',
      ).toEqual([]);

      // A signed-in CONSUMER is gated too, which is correct and worth stating:
      // the catalog is the same catalog for a consumer and for a browser, and a
      // gate that only `anon` respected would be defeated by signing in. MEMBER
      // owns nothing, so no owner policy can OR its way in.
      const member = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where slug = '${SLUG_C}'`,
        ),
      );
      expect(
        plainRows(member).map((r) => r.slug),
        'a signed-in consumer that owns nothing can read an active but ' +
          'unapproved business. The gate has to apply to the catalog role, not ' +
          'only to the anonymous one.',
      ).toEqual([]);
    } finally {
      await ctx.sql.unsafe(
        `update public.businesses set is_active = false where id = '${BIZ_C}'`,
      );
    }

    // Back to the real state, read as `anon`, so the tests after this one are
    // measuring the ledger and not this probe.
    expect(await visibleSlugs(ctx.sql, 'anon', null)).toEqual([SLUG_A]);
  });

  /**
   * `anon` reads every column of the public catalog, `email` and `phone`
   * included, and this is a KNOWN EXPOSURE rather than a bug report.
   *
   * The chain, in the order the ledger wrote it:
   *
   *   20260925163235  replaced table-wide SELECT on `businesses` with
   *                   per-column grants, so `anon` could not read `balance`,
   *                   `commission_rate`, `verification_status`, `verified_at`,
   *                   `verified_by`, `rejection_reason` or `owner_id`. For a
   *                   direct read that works exactly as intended, and it is
   *                   trivially verifiable with `has_column_privilege`, which is
   *                   why it looked correct.
   *
   *   20260925224820  reversed it, twenty minutes later, because PostgREST needs
   *                   TABLE-level SELECT on a referenced table to resolve
   *                   relationships. `offers`, `business_locations` and `orders`
   *                   carry foreign keys to `businesses`, so every read through
   *                   `/rest/v1/offers` failed with
   *                   `42501 permission denied for table businesses` — including
   *                   `select=id` with no embed, and including the offers
   *                   catalog, which is the product. Column-level grants and
   *                   PostgREST relationships are mutually exclusive.
   *
   * The follow-up both migrations name is the companion-table split:
   * `20260925225227` created the tables, `20260927025753` drops the columns. In
   * production that is done and `businesses` holds only public data.
   *
   * In THIS database the follow-up has not landed, so the exposure is the full
   * pre-phase-3 one: `anon` reads twenty-four columns including `owner_id`,
   * `balance`, `commission_rate`, `verification_status` and `verified_by`, and
   * the two companion tables that were supposed to receive them are unreadable
   * to every client role. So the sensitive values are readable on BOTH sides of
   * the split. That is a direct consequence of the pinned replay failure and it
   * is asserted rather than smoothed over.
   *
   * Row access is still bounded by RLS: `anon` sees the active rows and nothing
   * else, which is the test above. A per-column REVOKE is deliberately NOT the
   * mitigation — `20260925224820` documents that once a role holds table-level
   * SELECT, revoking individual columns does not take them away, so writing one
   * would be a mitigation that does not mitigate.
   */
  test('anon reads the whole catalog, email and phone included, and the money columns too in this database', async () => {
    const row = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, unknown>[]>(
        `select * from public.businesses where slug = '${SLUG_A}'`,
      ),
    );
    const keys = Object.keys(plainRows(row)[0] ?? {});

    // Both halves, as sorted SETS rather than as a sequence.
    //
    // The seventeen public columns are readable, which is the point and is fine.
    // The seven phase-3 columns are ALSO readable, which is the debt: in
    // production they are on three companion tables and no client role can reach
    // them, so the second array would be empty and the two lines below would
    // describe a table that holds nothing sensitive.
    expect(
      PUBLIC_COLUMNS.filter((c) => !keys.includes(c)),
      'anon cannot read a public column of the catalog',
    ).toEqual([]);
    expect(
      MOVED_COLUMNS.filter((c) => keys.includes(c)).sort(),
      'the phase-3 columns are NOT on businesses in this database, so the ' +
        'anon exposure asserted below is only the public one and the rest of ' +
        'this comment no longer describes reality. See the pinned replay ' +
        'failure for 20260927025753.',
    ).toEqual([...MOVED_COLUMNS].sort());

    // Said directly, so the two columns the migration's own comment singles out
    // are not resting on a list assertion. They came back WITH the row; had the
    // policy hidden it this would be an empty array instead.
    expect(row).toHaveLength(1);
    const catalog = plainRows(row)[0] as Record<string, unknown>;
    expect(catalog.email, 'anon cannot read the business email').toBeDefined();
    expect(catalog.phone, 'anon cannot read the business phone').toBeDefined();
    expect(catalog.owner_id, 'anon cannot read the business owner').toBe(
      OWNER_A,
    );

    // And the privilege, so the disclosure is pinned at the ACL layer rather
    // than only as an observed row.
    const columns = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_column_privilege('anon', 'public.businesses', 'email',               'select') as email,
               has_column_privilege('anon', 'public.businesses', 'phone',               'select') as phone,
               has_column_privilege('anon', 'public.businesses', 'owner_id',           'select') as owner,
               has_column_privilege('anon', 'public.businesses', 'balance',            'select') as balance,
               has_column_privilege('anon', 'public.businesses', 'commission_rate',    'select') as commission,
               has_column_privilege('anon', 'public.businesses', 'verification_status', 'select') as status`),
    );
    expect(columns[0]).toEqual({
      email: true,
      phone: true,
      owner: true,
      balance: true,
      commission: true,
      status: true,
    });
  });

  /**
   * An admin sees every business and a non-admin sees fewer, and the difference
   * is produced by `auth_helpers.my_role()` alone.
   *
   * Same session role, same table, same statement shape — only the profile's
   * `role` differs, and the only thing in the ledger that can turn that into a
   * different answer is "Admins full access on businesses", which is `FOR ALL`,
   * `TO authenticated`, `USING (my_role() = 'admin')`. It also happens to be the
   * only write policy a client can reach with a table-level grant, which is why
   * this table is the place where an unreachable admin policy would show up.
   *
   * The `auth_helpers` schema has no USAGE grant for any client role and never
   * did, and the pilot established that the policies still run: the schema check
   * is made when the policy expression is resolved, at CREATE time, and only
   * ACL_EXECUTE is re-checked at query time. `authenticated` holds that, so the
   * admin policy is alive — and this test is the second place in the suite that
   * demonstrates it rather than taking the pilot's word for it.
   */
  test('an admin reads every business, and a member reading the same table reads fewer', async () => {
    const asAdmin = await visibleSlugs(ctx.sql, 'authenticated', ADMIN);
    const asMember = await visibleSlugs(ctx.sql, 'authenticated', MEMBER);
    const asOwner = await visibleSlugs(ctx.sql, 'authenticated', OWNER_A);
    const asAnon = await visibleSlugs(ctx.sql, 'anon', null);

    expect(
      asAdmin,
      'an admin reads fewer businesses than a member',
    ).not.toEqual(asMember);
    // Scoped to this file's own slugs, so the ledger's seed data cannot make this
    // fail and the assertion stays about the policies.
    expect(asAdmin).toEqual([SLUG_A, SLUG_B, SLUG_C]);
    expect(asMember).toEqual([SLUG_A]);
    expect(asOwner).toEqual([SLUG_A]);
    // A member is in the admin policy's `TO` list, so its expression was
    // evaluated and came back false, and the OR landed on the public read
    // policy. `anon` is not in that list at all and never evaluated it. Same
    // answer, two different paths — which is why asserting only the result would
    // not tell the two apart.
    expect(asMember).toEqual(asAnon);

    // RLS narrows, it never widens. An admin is held to a subset of what the
    // schema owner sees, like every other role.
    const asSchemaOwner = await visibleSlugs(ctx.sql, 'owner', null);
    const ownerSet = new Set(asSchemaOwner);
    expect(asAdmin.every((slug) => ownerSet.has(slug))).toBe(true);

    // The helper is still not callable by name, so the admin path is alive for a
    // reason nobody would guess. Asserted here because this is the third table
    // whose admin policy it is, and a change in the answer would mean the harness
    // had been handed a grant it does not have in production.
    const denial = await deniedAs(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe(`select auth_helpers.my_role()::text as role`),
    );
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for schema auth_helpers',
    );
  });
});

/**
 * ─── THE MODERATION GATE ON THE PUBLIC CATALOG ─────────────────────────────
 *
 * 20260928101500 rewrote "Anyone can view active businesses" from
 * `using (is_active = true)` to
 * `using (is_active = true and public.business_is_approved(businesses.id))`.
 *
 * ─── Why this is a `describe` and not four more tests upstairs ─────────────
 *
 * Two reasons, and the second is the one that decided it.
 *
 * The first is that it is a CHANGE OF CONCLUSIONS, not an addition. The file
 * already contains the measurement this migration reverses, stated as a finding
 * and asserted: a business written `is_active = true` while unapproved IS in the
 * anonymous catalog, and only the column grant prevents it. That test cannot be
 * left where it is, and it cannot be a one-line flip either, because its
 * `finally`, its catalog assertion and its comment all exist to make a point
 * that is now the opposite. A block that gathers the gate's own behaviour makes
 * the reversal legible as one thing rather than as drift across a 2000-line
 * file.
 *
 * The second is the fixture. The gate is only observable with a row that is
 * active and unapproved, and this file already has one: `BIZ_C` is inactive and
 * pending with no `business_moderation` row, which is the exact shape the gate
 * hides. Building a second file means a second `beforeAll` re-seeding the same
 * four users, the same three businesses and the same companion rows, and a
 * second clone of the template. Duplicated fixtures are how two files end up
 * disagreeing about what `BIZ_C` is.
 *
 * ─── What the gate is, and what it is not ─────────────────────────────────
 *
 * It narrows exactly one surface: the ANONYMOUS catalog. It is one PERMISSIVE
 * SELECT policy among five, and the other four OR into it — the admin policy and
 * the two owner policies. So a business owner and an admin still see
 * unapproved businesses, and `service_role` bypasses RLS entirely.
 *
 * That is asserted, not assumed, and it is the half of this block that matters
 * most. An RLS hardening that breaks the admin panel or the owner panel is not a
 * hardening, it is a different incident — and the inline-EXISTS spelling of this
 * very policy does exactly that, measured: it returns `42501 permission denied
 * for table business_moderation` for `anon`, a member, an admin and an owner
 * alike, because the subquery is permission-checked at executor startup before
 * any row is read. Which is why the gate is a SECURITY DEFINER helper, and why
 * `public.business_is_approved` is asserted to be one below.
 */
describe('the public catalog requires moderation, not just is_active', () => {
  /**
   * The gate, as text, exactly as the migration wrote it.
   *
   * Asserted as the stored `qual` rather than as behaviour first, because the
   * behaviour has two independent failure modes and this pins the one that is
   * invisible: a policy that was never recreated at all still yields a plausible
   * catalog, because `is_active = true` on `BIZ_A` produces the same one row
   * either way. If the gate is dropped, the row assertions in this block fail;
   * if the gate is written wrong — the helper called with the wrong argument, or
   * `is_active` dropped by accident — this fails and says which of the two
   * conditions went missing.
   */
  test('the catalog policy is is_active AND an approved-moderation check, and the check is a SECURITY DEFINER function', async () => {
    const policies = await ctx.sql.unsafe<
      { policyname: string; cmd: string; roles: string[]; qual: string }[]
    >(
      `select policyname, cmd, roles, qual::text as qual
         from pg_policies
        where schemaname = 'public'
          and tablename   = 'businesses'
          and policyname  = 'Anyone can view active businesses'`,
    );

    expect(
      plainRows(policies),
      'the public catalog policy is missing, or it is no longer a permissive ' +
        'SELECT policy TO public — which is the surface anon reads through',
    ).toEqual([
      {
        policyname: 'Anyone can view active businesses',
        cmd: 'SELECT',
        roles: ['public'],
        qual: '((is_active = true) AND business_is_approved(id))',
      },
    ]);

    // The qual is stored unqualified because `public` is on the search_path at
    // CREATE time, so the text alone cannot tell a helper call from a bare table
    // name. `pg_depend` can. A policy records its expression's dependencies on
    // `pg_policy` — NOT on `pg_rewrite`, which is the first thing to reach for
    // and returns nothing, because a policy has no rewrite rule at all. Getting
    // that wrong produces a test that passes on zero rows.
    //
    // So this distinguishes the two spellings the migration rejected: the
    // SECURITY DEFINER function, which is an `n` (normal) dependency of the
    // policy, and the inline EXISTS subquery, which depends on the TABLE
    // business_moderation instead. The first draft of this assertion joined
    // pg_rewrite, found nothing, and would have reported a count of 0 for a
    // policy that was correct.
    const refs = await ctx.sql.unsafe<{ proname: string; relname: string }[]>(
      `select p.proname, c.relname
         from pg_depend d
         join pg_policy pol on pol.oid = d.objid
         join pg_class c    on c.oid = pol.polrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p     on p.oid = d.refobjid
        where n.nspname = 'public'
          and c.relname = 'businesses'
          and d.classid = 'pg_policy'::regclass
          and d.refclassid = 'pg_proc'::regclass`,
    );
    expect(
      plainRows(refs).map((r) => r.proname),
      'the catalog policy no longer depends on public.business_is_approved. The ' +
        'gate was rewritten to something else — and the inline-EXISTS spelling ' +
        'breaks every client role with 42501, so this is not cosmetic.',
    ).toContain('business_is_approved');

    // SECURITY DEFINER, STABLE, and a pinned empty search_path. The first is
    // the whole mechanism: a policy subquery is permission-checked as the
    // CALLING role, so only a definer function can read a table the caller
    // cannot. The third is the standard definer hardening, and it is load
    // bearing precisely because the function runs with elevated rights.
    const fn = await ctx.sql.unsafe<
      {
        prosecdef: boolean;
        provolatile: string;
        proconfig: string[] | null;
        proisstrict: boolean;
      }[]
    >(
      `select p.prosecdef, p.provolatile, p.proconfig, p.proisstrict
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'business_is_approved'
          and p.pronargs = 1`,
    );
    expect(
      plainRows(fn),
      'public.business_is_approved is missing or is not the shape the policy ' +
        'needs: SECURITY DEFINER so it can read business_moderation, STABLE so ' +
        'the planner treats it as a stable predicate, and a pinned search_path.',
    ).toEqual([
      {
        prosecdef: true,
        provolatile: 's',
        proconfig: ['search_path=""'],
        proisstrict: false,
      },
    ]);

    // The EXECUTE grant is explicit and PUBLIC is excluded.
    //
    // 20260507215323 revoked EXECUTE on public-schema functions as a DEFAULT
    // privilege, so in production a function created by a later migration is not
    // callable by anyone until the migration says so, and the policy fails with
    // `42501 permission denied for function`. The harness does NOT reproduce
    // that default revoke — a new public function is executable by PUBLIC there
    // — so this assertion is what keeps the harness describing the production
    // surface rather than a locally wider one.
    const grants = await ctx.sql.unsafe<Record<string, boolean>[]>(
      `select has_function_privilege('anon',         'public.business_is_approved(uuid)', 'execute') as anon,
              has_function_privilege('authenticated','public.business_is_approved(uuid)', 'execute') as authenticated,
              has_function_privilege('public',       'public.business_is_approved(uuid)', 'execute') as public`,
    );
    expect(grants[0]).toEqual({
      anon: true,
      authenticated: true,
      public: false,
    });
  });

  /**
   * THE TEST THIS MIGRATION EXISTS FOR.
   *
   * `BIZ_C` is active and its moderation state is `pending`, and `anon` cannot
   * see it. Before 20260928101500 the very same row was visible, and this file
   * asserted that it was — the measurement is in `anon sees the active
   * businesses` below, unchanged, and the two together are the before and after.
   *
   * The row is written by the SCHEMA OWNER, not by a client role. That is the
   * point: this is not a claim about what a malicious client can do, it is the
   * stronger claim that the catalog does not depend on WHO wrote the row. Every
   * writer that can legitimately set `is_active` — the API, as schema owner or
   * `service_role` — can get the row into this state by accident, and the
   * invariant must hold for them too.
   *
   * Committed and undone in a `finally`, so the tests after it measure the
   * ledger rather than this probe.
   */
  test('a business that is active but NOT approved is not in the anonymous catalog', async () => {
    // Precondition, re-read rather than trusted from the seed: an INSERT that
    // names neither moderation column is decided entirely by the trigger chain.
    const before = await ctx.sql.unsafe<
      { is_active: boolean; verification_status: string; moderation: number }[]
    >(
      `select b.is_active,
              b.verification_status::text,
              (select count(*)::int from public.business_moderation m
                where m.business_id = b.id) as moderation
         from public.businesses b
        where b.id = '${BIZ_C}'`,
    );
    expect(before[0]).toEqual({
      is_active: false,
      verification_status: 'pending',
      moderation: 0,
    });

    await ctx.sql.unsafe(
      `update public.businesses set is_active = true where id = '${BIZ_C}'`,
    );
    try {
      // The trigger did not fire and did not correct it. `is_active` is now true
      // with the status still pending — the exact state that used to publish.
      const row = await ctx.sql.unsafe<
        { is_active: boolean; verification_status: string }[]
      >(
        `select is_active, verification_status::text
           from public.businesses where id = '${BIZ_C}'`,
      );
      expect(row[0]).toEqual({
        is_active: true,
        verification_status: 'pending',
      });

      // The finding. Zero rows, no error — a policy filtering a row out and a
      // policy that was never reached look identical from here, which is why the
      // text of the policy is asserted separately above.
      const visible = await as(ctx.sql, 'anon', null, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where id = '${BIZ_C}'`,
        ),
      );
      expect(
        plainRows(visible),
        'the active-but-unapproved business IS in the anonymous catalog. The ' +
          'moderation gate is not being applied: either the policy was not ' +
          'recreated or the helper returns true for an unapproved business.',
      ).toEqual([]);

      // And it is out of the catalog as a LISTING too, not just unaddressable
      // by id — an id-keyed miss is not what a browser sees.
      const catalog = await visibleSlugs(ctx.sql, 'anon', null);
      expect(catalog).toEqual([SLUG_A]);
      expect(catalog).not.toContain(SLUG_C);
    } finally {
      await ctx.sql.unsafe(
        `update public.businesses set is_active = false where id = '${BIZ_C}'`,
      );
    }

    // Back to the ledger, so the tests after this one are not measuring the
    // probe.
    expect(await visibleSlugs(ctx.sql, 'anon', null)).toEqual([SLUG_A]);
  });

  /**
   * The gate narrows the CATALOG and nothing else. This is the half that a
   * hardening can silently break, and the half the inline-EXISTS spelling does
   * break, so it is asserted per role rather than as one contrast.
   *
   * Three reads of the same active-but-unapproved row, all while it is active:
   *
   *   anon    zero rows    the gate
   *   owner   one row      "Owners can view own businesses" ORed in
   *   admin   one row      "Admins full access on businesses" ORed in
   *   service one row      BYPASSRLS
   *
   * The owner reading is the one that looks wrong to a reviewer and is the
   * point: `OWNER_B` owns `BIZ_C` and must be able to see and edit its own
   * business whether or not it has been approved, because that is what the
   * owner panel is. Hiding it from its own owner would be a product bug, not a
   * security improvement.
   */
  test('the gate is for the public catalog only: the owner, the admin and service_role still see an unapproved business', async () => {
    await ctx.sql.unsafe(
      `update public.businesses set is_active = true where id = '${BIZ_C}'`,
    );
    try {
      const asAnon = await as(ctx.sql, 'anon', null, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where id = '${BIZ_C}'`,
        ),
      );
      const asOwner = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where id = '${BIZ_C}'`,
        ),
      );
      const asAdmin = await as(ctx.sql, 'authenticated', ADMIN, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where id = '${BIZ_C}'`,
        ),
      );
      const asService = await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ slug: string }[]>(
          `select slug from public.businesses where id = '${BIZ_C}'`,
        ),
      );

      expect(plainRows(asAnon)).toEqual([]);
      expect(
        plainRows(asOwner).map((r) => r.slug),
        'a business owner cannot read its own unapproved business. The gate is ' +
          'one permissive policy among several and must not narrow the owner panel.',
      ).toEqual([SLUG_C]);
      expect(
        plainRows(asAdmin).map((r) => r.slug),
        'an admin cannot read an unapproved business. The admin policy is ' +
          'FOR ALL and has to keep working.',
      ).toEqual([SLUG_C]);
      expect(plainRows(asService).map((r) => r.slug)).toEqual([SLUG_C]);

      // The owner can still WRITE to it as well, which is what makes the read
      // above a policy result and not a fixture that happens to be visible.
      const renamed = await as(ctx.sql, 'authenticated', OWNER_B, (tx) =>
        tx.unsafe<{ name: string }[]>(
          `update public.businesses set name = 'renamed while unapproved'
            where id = '${BIZ_C}' returning name`,
        ),
      );
      expect(plainRows(renamed).map((r) => r.name)).toEqual([
        'renamed while unapproved',
      ]);
    } finally {
      await ctx.sql.unsafe(
        `update public.businesses
            set is_active = false, name = 'RLS businesses C'
          where id = '${BIZ_C}'`,
      );
    }
  });

  /**
   * `is_active` still rules, and the gate is an ADDITION rather than a
   * replacement.
   *
   * This is the reason the migration keeps `is_active = true` in the predicate
   * instead of replacing it: deactivation is an operator action that must keep
   * working on an approved business. `BIZ_A` has an approved moderation row
   * throughout, so flipping it active=false is a test of `is_active` alone with
   * the gate held satisfied.
   *
   * It is also the control for the test above. Without it, "the gate works" and
   * "the predicate is `is_active` only" would produce identical results on this
   * fixture, since `BIZ_C` is inactive anyway. Together the two tests say: the
   * row is hidden by moderation when it is active, and by `is_active` when it
   * is deactivated despite being approved.
   */
  test('an approved business that is deactivated leaves the catalog, so is_active still rules', async () => {
    const before = await ctx.sql.unsafe<
      { is_active: boolean; approved: boolean }[]
    >(
      `select b.is_active,
              (select m.verification_status::text = 'approved'
                 from public.business_moderation m where m.business_id = b.id) as approved
         from public.businesses b where b.id = '${BIZ_A}'`,
    );
    expect(before[0]).toEqual({ is_active: true, approved: true });

    await ctx.sql.unsafe(
      `update public.businesses set is_active = false where id = '${BIZ_A}'`,
    );
    try {
      const asAnon = await visibleSlugs(ctx.sql, 'anon', null);
      expect(
        asAnon,
        'a deactivated but approved business is still in the anonymous catalog, ' +
          'so the migration replaced is_active instead of adding to it',
      ).toEqual([]);
    } finally {
      await ctx.sql.unsafe(
        `update public.businesses set is_active = true where id = '${BIZ_A}'`,
      );
    }

    // Restored, and back in the catalog — so the zero above was the policy and
    // not a broken fixture.
    expect(await visibleSlugs(ctx.sql, 'anon', null)).toEqual([SLUG_A]);
  });

  /**
   * The creation path, re-checked against the gate rather than against the
   * grant.
   *
   * A client-created business has to fail three times over to reach the catalog
   * now, and each layer is worth naming because the gate is what makes the first
   * two optional rather than sufficient:
   *
   *   1. `is_active` and `verification_status` are outside the client column
   *      grants, so naming either on INSERT is a 42501;
   *   2. the trigger chain derives `is_active` from `verification_status`, which
   *      defaults to `pending`;
   *   3. and now, even if a row DID land active and approved, there is no
   *      `business_moderation` row for it — and in production the row is written
   *      by `trg_bootstrap_business_companions`, which is a platform trigger, so
   *      a client cannot create one.
   *
   * Layer 3 is asserted directly, without needing the grant, by inserting a row
   * with no moderation companion at all. That is the shape of every business a
   * client creates, and it is the one the gate is really for.
   */
  test('a newly created business is not in the catalog, and it has no moderation row to satisfy the gate', async () => {
    const created = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ id: string; slug: string; is_active: boolean }[]>(
        `insert into public.businesses (name, slug, type)
         values ('RLS businesses gated', 'rls-biz-gated', 'restaurant')
         returning id::text, slug, is_active`,
      ),
    );
    const businessId = plainRows(created)[0]?.id as string;
    expect(plainRows(created)[0]?.is_active).toBe(false);

    // No companion row, in this database AND in production: the bootstrap
    // trigger writes `pending`, and either way it is not `approved`, and no
    // client role can write that table.
    const moderation = await ctx.sql.unsafe<{ verification_status: string }[]>(
      `select verification_status::text from public.business_moderation
        where business_id = '${businessId}'`,
    );
    expect(
      plainRows(moderation),
      'the client-created business has a moderation row. It should be ' +
        'absent or pending — an APPROVED row would mean a client can approve its ' +
        'own business, which is a larger finding than the one this file covers.',
    ).not.toEqual([{ verification_status: 'approved' }]);

    const asAnon = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `select slug from public.businesses where slug = 'rls-biz-gated'`,
      ),
    );
    expect(plainRows(asAnon)).toEqual([]);

    // The client that created it can read it, so this is the catalog narrowing
    // and not the row being unreachable.
    const asCreator = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `select slug from public.businesses where slug = 'rls-biz-gated'`,
      ),
    );
    expect(plainRows(asCreator).map((r) => r.slug)).toEqual(['rls-biz-gated']);
  });

  /**
   * THE GATE IS NOT AN EMPTY SET. With the rows it returns the catalog, and
   * without them it returns nothing while the panel keeps working.
   *
   * Both halves are one test because a gate can fail in two opposite ways and
   * only measuring both distinguishes them. A policy wired wrong can publish too
   * much — the failure this migration closes — or it can publish nothing at all,
   * which is a TOTAL catalog outage that looks like a successful hardening in a
   * suite that only ever asserts "the bad row is absent". Every other test in
   * this block would pass under a policy that returned zero rows
   * unconditionally.
   *
   * The empty case is also what this harness produces by accident rather than by
   * design. `trg_bootstrap_business_companions` is one of the seven pinned
   * replay failures, so nothing writes `business_moderation` here and the
   * `beforeAll` fixture stands in for it. In PRODUCTION the table is populated —
   * 20260925225227 backfilled it and phase 3's trigger maintains it — so the
   * empty case is a shape this gate must HANDLE, not a state it lives in. What
   * matters is the direction it fails in, and it fails closed: the catalog
   * empties, and the admin, the owner and service_role do not notice.
   *
   * That last part is the assertion worth having. A fail-closed gate that also
   * broke the owner panel would turn a moderation regression into a total
   * platform outage, and it is the admin policy's `FOR ALL` plus the two owner
   * policies that keep the blast radius to one surface.
   */
  test('the gate returns the catalog when the moderation rows exist, and only the catalog fails closed when they do not', async () => {
    // The populated case first, and asserted POSITIVELY: `BIZ_A` is active and
    // approved, and it IS listed. This is the assertion that fails under a gate
    // that hid everything.
    const seeded = await ctx.sql.unsafe<
      { slug: string; is_active: boolean; status: string }[]
    >(
      `select b.slug, b.is_active, m.verification_status::text as status
         from public.businesses b
         join public.business_moderation m on m.business_id = b.id
        where b.id = '${BIZ_A}'`,
    );
    expect(plainRows(seeded)).toEqual([
      { slug: SLUG_A, is_active: true, status: 'approved' },
    ]);
    expect(
      await visibleSlugs(ctx.sql, 'anon', null),
      'the approved, active business is not in the catalog. The gate is refusing ' +
        'everything, which would be a total outage rather than a hardening.',
    ).toEqual([SLUG_A]);

    // Now take the moderation table away, and watch which surface notices.
    await ctx.sql.unsafe(`delete from public.business_moderation`);
    try {
      const asAnon = await visibleSlugs(ctx.sql, 'anon', null);
      const asMember = await visibleSlugs(ctx.sql, 'authenticated', MEMBER);
      const asAdmin = await visibleSlugs(ctx.sql, 'authenticated', ADMIN);
      const asOwnerA = await visibleSlugs(ctx.sql, 'authenticated', OWNER_A);
      const asOwnerB = await visibleSlugs(ctx.sql, 'authenticated', OWNER_B);
      const asService = await visibleSlugs(ctx.sql, 'service_role', null);

      expect(
        asAnon,
        'anon still sees the catalog with no moderation rows at all',
      ).toEqual([]);
      expect(asMember).toEqual([]);
      // The panel is untouched, and this is the assertion that makes the
      // fail-closed direction affordable: missing moderation data must cost the
      // public catalog its rows, not the owner panel and not the admin's queue.
      expect(asAdmin).toEqual([SLUG_A, SLUG_B, SLUG_C]);
      expect(asOwnerA).toEqual([SLUG_A]);
      expect(asOwnerB).toEqual([SLUG_B, SLUG_C]);
      expect(asService).toEqual([SLUG_A, SLUG_B, SLUG_C]);
    } finally {
      await ctx.sql.unsafe(
        `insert into public.business_moderation (business_id, verification_status)
         values ('${BIZ_A}', 'approved')
         on conflict (business_id) do nothing`,
      );
    }

    // And the catalog comes back, so the zero above was the gate reading an
    // empty table rather than a fixture that had gone wrong.
    expect(await visibleSlugs(ctx.sql, 'anon', null)).toEqual([SLUG_A]);
  });

  /**
   * The helper is reachable from a client and it is still not a way to read the
   * table.
   *
   * The residual is real and this asserts it rather than describing it in a
   * comment: `anon` can call `public.business_is_approved(uuid)` and learn a
   * boolean about a business id. The disclosure is nil-practical — for any
   * business the catalog lists the answer is knowably true, and for any other
   * business the id is an unguessable uuid — but a SECURITY DEFINER function
   * added to a security policy has to be held to the same standard as one
   * added to an RPC surface, and the honest description includes this.
   *
   * What it must NOT become is a read of the table. That is the invariant the
   * companion split bought, and it is asserted on the grant layer and on the
   * live session, because `businesses.rls.db.spec.ts` upstream already pins it
   * for the seeded rows and this is where the reason is written down.
   */
  test('the helper answers with a boolean and grants no read of business_moderation', async () => {
    const asAnon = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ approved: boolean }[]>(
        `select public.business_is_approved('${BIZ_A}') as approved`,
      ),
    );
    expect(plainRows(asAnon)).toEqual([{ approved: true }]);

    const asUnapproved = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ approved: boolean }[]>(
        `select public.business_is_approved('${BIZ_C}') as approved`,
      ),
    );
    expect(plainRows(asUnapproved)).toEqual([{ approved: false }]);

    // The boundary. Still zero privileges, still a grant-layer refusal naming
    // the TABLE rather than a policy error — a function that returned a row
    // instead of a boolean would have produced a `row-level security policy`
    // message here, since the table has no policies at all.
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `select business_id::text, verification_status::text from public.business_moderation`,
      ),
    );
    expect(
      denial,
      'anon read the moderation table through the helper',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain(
      'permission denied for table business_moderation',
    );
    expect(denial?.message).not.toContain('row-level security policy');
  });
});
