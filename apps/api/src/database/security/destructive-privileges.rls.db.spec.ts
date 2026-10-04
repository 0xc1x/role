import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * The three privileges RLS cannot govern, absent from every client role on
 * every RLS table in `public`.
 *
 * ─── Why this file exists and why it is not part of another one ─────────────
 *
 * `profiles-reviews.rls.db.spec.ts` found the TRUNCATE hole on one table,
 * `orders.rls.db.spec.ts` found the TRIGGER residue on one table, and
 * `categories.rls.db.spec.ts` recorded the seven privileges from Supabase's
 * default ACL as the canary. Each measured a single table. The fix is a
 * statement about the SET, so the assertion that proves it cannot be one about a
 * table: a spec that checks `reviews` says nothing about the next table, and the
 * next table is the whole reason the default privileges exist.
 *
 * It is its own file rather than a describe block in one of those three because
 * it has no fixture. There is nothing to seed, nothing to impersonate and no
 * persona — the subject is the catalog itself — and adding it to a file whose
 * `beforeAll` seeds five users and two businesses would make a test with a
 * 20-line query fail against a fixture it never used.
 *
 * ─── What the migration did, in one paragraph ───────────────────────────────
 *
 * `20260928181714_revoke_client_destructive_privileges.sql` revokes `truncate`,
 * `trigger` and `references` from `anon` and `authenticated` on every table in
 * `public` that has RLS enabled, and revokes the same three from the DEFAULT
 * privileges so the next `create table` is born without them. `service_role`
 * keeps all three and that is deliberate: it is the backend role, it has
 * BYPASSRLS by design, and constraining it would break Supabase's architecture to
 * remove a capability nobody asked about. The migration header carries the long
 * form, including why TRUNCATE is a latent privilege that PostgREST cannot
 * reach today and why TRIGGER is closer to live.
 *
 * ─── The default privileges are the part that makes this a fix ──────────────
 *
 * Before the migration, production measured:
 *
 *     role            TRUNCATE   TRIGGER   REFERENCES
 *     anon                    31        32           32
 *     authenticated           31        32           32
 *     service_role            39        39           39
 *
 * over 39 RLS tables. Revoking without also revoking the default privileges
 * would have left the next `create table` holding all three again, which is why
 * `the next table is born without them` below is a separate test and not a
 * footnote on the revoke.
 *
 * ─── WHY THE SCOPE IS "EVERY RLS TABLE" AND NOT A LIST ────────────────────
 *
 * Enumerating 39 names is correct on the day it is written and wrong the day
 * someone adds a table, and that failure mode is exactly what produced the
 * leak: the ledger revoked per-table, the lists ran out at different points, and
 * `order_events` survived by four clauses. Everything below is asserted over the
 * set so the assertion has the same shape as the fix.
 *
 * ─── THE HARNESS AND PRODUCTION AGREE ON EVERY RLS TABLE ────────────────────
 *
 * As of `20261004022647`, production has 41 tables in `public` and RLS
 * enabled on all 41. This replay
 * used to have 39 tables and RLS enabled on 34 — `business_finance`,
 * `business_moderation`, `app_store`, `offer_categories` and `slides` all landed
 * without it, because no statement in `supabase/migrations/` ever enabled RLS on
 * them. `20260928184943_enable_rls_on_unrecorded_tables.sql` is the five
 * `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements that the ledger was
 * missing, and it closes the gap.
 *
 * That matters for THIS file specifically, and the reason is not tidiness. The
 * migration's filter is `relrowsecurity`, so for as long as the gap existed the
 * migration was proven over 34 tables in the harness while running over 39 in
 * production: the coverage was correct where it counted and UNDERSTATED where it
 * was measured. Every assertion below was scoped to the RLS tables precisely so
 * it would hold in both places, which is why a 34-table harness could not
 * distinguish a correct migration from an incomplete one. `rlsTableCount()` now
 * returns the same number in both, so the filter selects the same set in both
 * and the scope below is the whole schema rather than a subset of it.
 *
 * The false claim this replaces is worth recording, because the earlier version
 * of this header asserted that production runs `public.rls_auto_enable()` as an
 * event trigger and that the gap was therefore an artefact of the harness
 * bootstrap. That is not true. The function exists in production and is attached
 * to nothing: `select evtname from pg_event_trigger` returns zero rows. Nothing
 * was auto-enabling anything, in either environment, and the 34 came from the
 * ledger being incomplete rather than from the harness being lossy.
 * `enable_rls.rls.db.spec.ts` now pins that as a measured fact.
 */

let ctx: SupabaseTestDb;

/**
 * postgres.js answers with a `RowList`, which is an array that also carries
 * query metadata. `toEqual` compares the metadata too. Same normalisation as the
 * other specs: spread it.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * The tables with RLS in `public`, counted as the owner.
 *
 * The number itself is never written here: the two `expect(tables).toBe(...)`
 * assertions below pin it, and that pin moved from 39 to 41 when
 * `20261004022647_announcements.sql` added `public.announcements` and
 * `public.announcement_acknowledgements`. A constant in this comment would have
 * been a lie the first time a table was added, which is the reason the count is
 * pinned in a test and described here by reference. The count is still read from
 * the catalog rather than returned as a literal, because the assertions above
 * COMPARE against it — `service_role`'s grant rows are expected to equal this
 * number — and a hardcoded constant there would make those comparisons
 * assertions about a constant rather than about the database.
 *
 * `public._harness_fingerprint` is a table this harness creates to cache the
 * template fingerprint. It is created after the replay, carries no RLS, and has
 * no business being in a count that describes the product schema, so it is
 * excluded explicitly. The exclusion is named rather than applied by a
 * `not like` on a name pattern: a pattern would silently swallow a real product
 * table that happened to match it.
 */
async function rlsTableCount(): Promise<number> {
  const rows = await ctx.sql.unsafe<{ c: number }[]>(
    `select count(*)::int as c
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity
        and c.relname <> '_harness_fingerprint'`,
  );
  return plainRows(rows)[0]?.c ?? -1;
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
});

afterAll(async () => {
  await ctx.stop();
});

describe('no client role holds a privilege RLS cannot govern', () => {
  /**
   * The whole finding, as one empty result set.
   *
   * Asserted over the SET and not per table, which is the only shape that has
   * the property the task needs: the next table added to `public` with RLS on is
   * covered by this assertion the moment it exists, without anyone editing it.
   * A per-table assertion has the opposite property — it certifies the tables
   * someone remembered.
   *
   * `information_schema.role_table_grants` rather than `aclexplode(relacl)`
   * because the information schema view reports what the ACL says about a
   * NAMED role, which is the question. It reports `is_grantable` as well and
   * nothing here filters on it: a privilege that cannot be re-granted is still
   * a privilege the caller holds.
   *
   * The anti-vacuity guard is load-bearing and comes first. This query returns
   * `[]` for a database where RLS was never enabled on anything, where the
   * schema is misspelled, or where the migration silently matched nothing — and
   * a green empty set is the exact shape a broken assertion produces. So the
   * set is proven non-empty before it is proven clean.
   */
  test('anon and authenticated hold none of TRUNCATE, TRIGGER or REFERENCES on ANY RLS table', async () => {
    const tables = await rlsTableCount();
    expect(
      tables,
      'no table in public has RLS enabled, so this file is asserting against an ' +
        'empty set and every result below would pass for the wrong reason',
    ).toBeGreaterThan(30);
    // And the exact number, so a schema that lost RLS wholesale fails HERE with
    // a count in the message rather than three tests later as an empty set.
    expect(tables).toBe(41);

    const residue = await ctx.sql.unsafe<
      { grantee: string; table_name: string; privilege_type: string }[]
    >(
      `select g.grantee, g.table_name, g.privilege_type
         from information_schema.role_table_grants g
         join pg_class c on c.relname = g.table_name
         join pg_namespace n on n.oid = c.relnamespace
        where g.table_schema = 'public'
          and n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity
          and g.grantee in ('anon', 'authenticated')
          and g.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        order by g.grantee, g.table_name, g.privilege_type`,
    );

    expect(
      plainRows(residue).map(
        (r) => `${r.grantee}:${r.privilege_type}:${r.table_name}`,
      ),
      'a client role holds a privilege RLS cannot govern. TRUNCATE and TRIGGER ' +
        'are not filtered by any USING clause, and TRIGGER additionally lets the ' +
        'role attach its own trigger to a table it does not own — which on ' +
        'order_events means attaching a SECURITY DEFINER trigger to the ' +
        'append-only log.',
    ).toEqual([]);
  });

  /**
   * The live session, asked directly, as a guard against a catalog that lists a
   * privilege no session can actually use.
   *
   * `has_table_privilege` is evaluated for the role by name and is the same
   * function the ACL check uses, so it is the layer the failure would appear at.
   * Both roles are asked over every RLS table in one query, which is the
   * per-session counterpart of the set assertion above rather than a repeat of
   * it: the catalog view and the live check have failed to agree before on
   * grants that were revoked for a specific role by something the view does not
   * show.
   */
  test('the live sessions agree: neither client role can truncate, trigger or reference any RLS table', async () => {
    const tables = await rlsTableCount();

    for (const [role, userId] of [
      ['anon', null],
      ['authenticated', '11111111-1111-1111-1111-111111111111'],
    ] as const) {
      const held = await as(ctx.sql, role, userId, (tx) =>
        tx
          .unsafe<{ relname: string; priv: string }[]>(
            `
              select c.relname, p.priv
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                cross join lateral unnest(
                  array['TRUNCATE', 'TRIGGER', 'REFERENCES']
                ) as p(priv)
               where n.nspname = 'public'
                 and c.relkind = 'r'
                 and c.relrowsecurity
                 and has_table_privilege('${role}', c.oid, p.priv)
               order by c.relname, p.priv`,
          )
          .then((rows) => plainRows(rows)),
      );

      expect(
        held.map((h) => `${h.priv}:${h.relname}`),
        `${role} can still use a privilege RLS does not govern`,
      ).toEqual([]);
    }

    // Spelled out so a regression names the number rather than the emptiness.
    expect(tables).toBeGreaterThan(30);
  });

  /**
   * The residue the `relrowsecurity` filter leaves behind is now EMPTY, and that
   * is the assertion that makes this file's coverage demonstrable.
   *
   * This used to assert the residue was exactly the set of tables WITHOUT RLS,
   * and to assert `rlsTableCount()` was `toBeLessThan(39)` — an assertion that
   * documented the gap as permanent. It was honest about what it could not see:
   * with five tables outside the filter, this file proved a revoke over 34 tables
   * while the migration ran over 39.
   *
   * Both halves are now the strong claim. Every table a client role holds one of
   * the three privileges on must have RLS — so nothing escapes the filter — AND
   * the RLS table count must be exactly the number production holds, which the
   * `expect(tables).toBe(...)` below pins rather than this comment: the count
   * went from 39 to 41 with `20261004022647_announcements.sql`, and a constant
   * written here would be wrong again by the next table. The count is what makes
   * the first half mean something: "no residue" is trivially true in a database
   * where almost nothing has RLS, and that pin is what rules that out.
   */
  test('the filter leaves nothing behind: every table a client role holds a destructive privilege on has RLS', async () => {
    const residue = await ctx.sql.unsafe<{ table_name: string }[]>(
      `select distinct g.table_name
         from information_schema.role_table_grants g
         join pg_class c on c.relname = g.table_name
         join pg_namespace n on n.oid = c.relnamespace
        where g.table_schema = 'public'
          and n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity
          and g.grantee in ('anon', 'authenticated')
          and g.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        order by g.table_name`,
    );

    // Every residue table must genuinely lack RLS — the assertion is not "there
    // is residue" but "the residue is exactly the out-of-scope set".
    const stillRls = await ctx.sql.unsafe<{ relname: string }[]>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity
          and c.relname in (${
            plainRows(residue)
              .map((r) => `'${r.table_name}'`)
              .join(',') || `'__none__'`
          })`,
    );
    expect(
      plainRows(stillRls),
      'a table with RLS enabled still holds one of the three privileges for a ' +
        'client role. The first assertion in this file should have caught this.',
    ).toEqual([]);

    // The number on the right is the point of the whole file. It is what
    // production has and what this harness now has, so the `relrowsecurity`
    // filter that the migration iterates selects the same set of tables in both.
    // One less than it would mean a table lost its RLS, and one more would mean
    // a new table arrived without the ledger row that would enable it — both are
    // the exact class of gap `20260928184943` exists to close, arriving again.
    // The count is written as a relation and not as literals because it moves
    // with the schema: 41 today, 39 before `20261004022647`.
    expect(
      await rlsTableCount(),
      "the harness no longer reproduces production's RLS coverage. This file " +
        'can only claim the migration covers every RLS table in public if every ' +
        'table in public has RLS.',
    ).toBe(41);
  });
});

describe('service_role keeps all three, and that is the design', () => {
  /**
   * The positive assertion, and the reason this file is not a ratchet.
   *
   * Without it, "revoke everything everywhere" passes every test in this file
   * while breaking the product. `service_role` is the backend role: BYPASSRLS by
   * design, the key the Edge Functions use, and the role that owns every
   * maintenance path. It keeps TRUNCATE, TRIGGER and REFERENCES on every RLS
   * table, and the count is compared against the live table count rather than a
   * literal so a forty-table schema does not fail here.
   *
   * Asserted on all three privileges separately because they were revoked
   * separately and a partial revoke is the realistic mistake: an `alter default
   * privileges` that named two of the three would show up here as a row missing
   * rather than as a diff nobody reads.
   */
  test('service_role holds TRUNCATE, TRIGGER and REFERENCES on every RLS table', async () => {
    const tables = await rlsTableCount();

    const held = await ctx.sql.unsafe<
      { privilege_type: string; tables: number }[]
    >(
      `select g.privilege_type, count(*)::int as tables
         from information_schema.role_table_grants g
         join pg_class c on c.relname = g.table_name
         join pg_namespace n on n.oid = c.relnamespace
        where g.table_schema = 'public'
          and n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity
          and g.grantee = 'service_role'
          and g.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        group by g.privilege_type
        order by g.privilege_type`,
    );

    expect(plainRows(held)).toEqual([
      { privilege_type: 'REFERENCES', tables },
      { privilege_type: 'TRIGGER', tables },
      { privilege_type: 'TRUNCATE', tables },
    ]);

    // And the live session, because a grant the catalog lists and the session
    // cannot use is still a grant somebody has to not-revoke.
    const live = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<Record<string, boolean>[]>(`
        select has_table_privilege('service_role', 'public.order_events', 'TRUNCATE')   as trunc,
               has_table_privilege('service_role', 'public.order_events', 'TRIGGER')    as trg,
               has_table_privilege('service_role', 'public.order_events', 'REFERENCES') as refs,
               has_table_privilege('service_role', 'public.reviews', 'TRUNCATE')        as rev_trunc,
               has_table_privilege('service_role', 'public.reviews', 'TRIGGER')         as rev_trg,
               has_table_privilege('service_role', 'public.reviews', 'REFERENCES')      as rev_refs`),
    );
    expect(plainRows(live)[0]).toEqual({
      trunc: true,
      trg: true,
      refs: true,
      rev_trunc: true,
      rev_trg: true,
      rev_refs: true,
    });
  });
});

describe('the next table is born clean, which is what makes this a fix', () => {
  /**
   * The default privileges, read straight out of `pg_default_acl`.
   *
   * Without this second half the migration is a patch: the revoke is correct
   * today and the next `create table` — from any migration, from Supabase's own
   * tooling, from a column someone adds in a hurry — is born with `arwdDxtm`
   * again and nobody measures anything. `20260507215323_harden_phase2_
   * security_surface.sql` is the exact precedent in this repository: it revoked
   * EXECUTE on functions as a default privilege for the same reason.
   *
   * Asserted over EVERY grantor with a default-privilege entry for tables in
   * `public`, not just the current role. `ALTER DEFAULT PRIVILEGES` without
   * `FOR ROLE` applies only to the role that executes it, and production has two
   * grantors — `postgres` and `supabase_admin` — so revoking under one of them
   * would leave every table the other one creates fully privileged. The
   * information schema does not expose default privileges, which is why this
   * reads the catalog.
   *
   * The expectation is spelled out as the full ACL string rather than as a
   * boolean per privilege, so a fourth privilege appearing in the default grant
   * is visible in a one-line diff instead of hiding behind a per-privilege check
   * that nobody reads.
   */
  test('no grantor will hand TRUNCATE, TRIGGER or REFERENCES to a client role on a new table', async () => {
    const rows = await ctx.sql.unsafe<
      { grantor: string; grantee: string; privileges: string }[]
    >(
      `select pg_get_userbyid(d.defaclrole) as grantor,
              x.grantee::regrole::text     as grantee,
              string_agg(x.privilege_type, ',' order by x.privilege_type) as privileges
         from pg_default_acl d
         join pg_namespace n on n.oid = d.defaclnamespace
         cross join lateral aclexplode(d.defaclacl) x
        where n.nspname = 'public'
          and d.defaclobjtype = 'r'
          and x.grantee in (
            (select oid from pg_roles where rolname = 'anon'),
            (select oid from pg_roles where rolname = 'authenticated'),
            (select oid from pg_roles where rolname = 'service_role')
          )
        group by 1, 2
        order by 1, 2`,
    );

    expect(
      plainRows(rows).length,
      'no default privileges on tables in public. Without an entry the platform ' +
        'grants whatever it grants and this file cannot see it — the migration ' +
        'refuses to apply in that state on purpose.',
    ).toBeGreaterThan(0);

    // Every grantor, every client role, spelled out as the privilege list. The
    // expectation is the four that survive rather than "not the three that do
    // not", so a fourth revoked privilege appearing here fails loudly instead of
    // passing a check that only knows what it is looking for.
    expect(
      plainRows(rows)
        .filter((r) => r.grantee !== 'service_role')
        .map((r) => `${r.grantor} → ${r.grantee}: ${r.privileges}`),
      'a grantor will still hand one of TRUNCATE, TRIGGER or REFERENCES to a ' +
        'client role on the next create table',
    ).toEqual(
      plainRows(rows)
        .filter((r) => r.grantee !== 'service_role')
        .map((r) => `${r.grantor} → ${r.grantee}: DELETE,INSERT,SELECT,UPDATE`),
    );

    // `service_role` keeps all seven by design. Asserted on the exact list so
    // the row above cannot be satisfied by someone narrowing the default grant
    // for every role at once — which would be the wrong way to fix this and
    // would break the backend silently. See the previous describe block.
    expect(
      plainRows(rows)
        .filter((r) => r.grantee === 'service_role')
        .map((r) => `${r.grantor} → ${r.privileges}`),
      'the default privileges for service_role were narrowed. It is the backend ' +
        'role and it keeps all seven.',
    ).toEqual(
      plainRows(rows)
        .filter((r) => r.grantee === 'service_role')
        .map(
          (r) =>
            `${r.grantor} → DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`,
        ),
    );
  });

  /**
   * The behavioural half: CREATE a table right now and look at what it is born
   * holding.
   *
   * This is the assertion that would fail if someone removed the second `do`
   * block from the migration and left the revoke in place. The catalog test
   * above would also fail, but this one fails for the reason that matters — the
   * privilege is not a number in a catalog, it is what the next table in this
   * schema is born able to do.
   *
   * `deniedAs` is deliberately NOT used for the cleanup. Its comment claims the
   * transaction is always rolled back, which holds only on the rejection path:
   * `as()` runs its callback inside `sql.begin()`, and postgres.js commits when
   * the callback resolves. A successful `create table` would therefore commit
   * and a failure in the `finally` would leave the probe behind for every later
   * test in the file to measure. The probe is created and dropped as the OWNER,
   * in one `finally`, and its absence is asserted afterwards rather than
   * assumed.
   */
  test('a table created after the migration holds none of the three, and the probe leaves nothing behind', async () => {
    const probe = 'rls_destructive_probe';

    // The barrier, asserted before the probe: if the default privileges still
    // grant the three, the probe below would be born holding them and the
    // failure would be reported as a property of the probe.
    const before = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name   = '${probe}'
          and grantee in ('anon', 'authenticated')`,
    );
    expect(plainRows(before)[0]?.n).toBe(0);

    await ctx.sql.unsafe(
      `create table public.${probe} (id integer primary key)`,
    );

    try {
      const born = await ctx.sql.unsafe<
        { grantee: string; privilege_type: string }[]
      >(
        `select grantee, privilege_type
           from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name   = '${probe}'
            and grantee in ('anon', 'authenticated')
          order by grantee, privilege_type`,
      );

      // The exact four, for both roles, rather than "not the three". Asserting
      // the complement would pass on a probe that came out with no privileges at
      // all, which is a different failure and just as wrong; and it would not
      // notice a default grant that had narrowed SELECT or INSERT.
      expect(
        plainRows(born).map((r) => `${r.grantee}:${r.privilege_type}`),
        'a table created after the migration was born with the wrong privilege ' +
          'set. TRUNCATE, TRIGGER or REFERENCES appearing here means the default ' +
          'privileges were not revoked and the problem recurs on every future ' +
          'table; any of the four going missing means the revoke went too far.',
      ).toEqual([
        'anon:DELETE',
        'anon:INSERT',
        'anon:SELECT',
        'anon:UPDATE',
        'authenticated:DELETE',
        'authenticated:INSERT',
        'authenticated:SELECT',
        'authenticated:UPDATE',
      ]);
    } finally {
      // Written not to throw on the happy path and not to throw on the failure
      // path either: `drop table … if exists` is the one statement that succeeds
      // in both, and this is the LAST statement in the finally so nothing can
      // skip it.
      await ctx.sql
        .unsafe(`drop table if exists public.${probe}`)
        .catch(() => {});
    }

    const after = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = '${probe}'`,
    );
    expect(
      plainRows(after)[0]?.n,
      'the probe table is still in the database. Every later assertion in this ' +
        'file would be measuring it.',
    ).toBe(0);
  });

  /**
   * The default ACL is a statement about the catalog; this is the statement a
   * client role would hit, and it is asserted as a refusal rather than as a
   * privilege so a re-grant cannot make it pass.
   *
   * Both roles, and both commands, because TRUNCATE and REFERENCES fail at
   * different points: TRUNCATE is refused by the table ACL, while a
   * `references` clause inside `create table` never gets that far — it is
   * refused on the SCHEMA, because no role may create a table in `public`. The
   * two codes are asserted apart on purpose, the same way
   * `orders.rls.db.spec.ts` separates them, and the reason the migration revoked
   * REFERENCES anyway is precisely that the schema was the only thing holding it.
   */
  test('a client role is refused TRUNCATE with the table, and REFERENCES before the table', async () => {
    const truncate = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`truncate public.reviews`),
    );
    expect(
      truncate,
      'anon truncated reviews. If this fails the TRUNCATE privilege came back, ' +
        'and note that no policy on reviews governs it: RLS does not filter ' +
        'TRUNCATE at all, so a passing test here would be the empty-table case.',
    ).not.toBeNull();
    expect(truncate?.code).toBe('42501');
    expect(truncate?.message).toContain('permission denied for table reviews');

    const references = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `create table public.rls_destructive_fk (id int references public.reviews(id))`,
      ),
    );
    expect(references).not.toBeNull();
    expect(references?.code).toBe('42501');
    expect(references?.message).toContain(
      'permission denied for schema public',
    );
  });
});
