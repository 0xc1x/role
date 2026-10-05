import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * RLS coverage of `public` as a whole, and the deny the closed tables rest on.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * Six specs in this directory assert that a particular table's policies behave
 * a particular way, and every one of them is scoped to a table someone
 * remembered. Nothing asserted the property that would have caught this:
 * that a table in `public` without RLS is a defect. That is the invariant this
 * file owns, and it is the one that broke six times.
 *
 * `20260928184943_enable_rls_on_unrecorded_tables.sql` exists because five
 * tables had RLS in production and no `ALTER TABLE ... ENABLE ROW LEVEL
 * SECURITY` anywhere in `supabase/migrations/`: `app_store`,
 * `business_finance`, `business_moderation`, `offer_categories` and `slides`.
 * A fresh `supabase db push` therefore built a schema where those five had NO
 * row level security, while the live database had it on all 39 tables.
 *
 * The harness reproduced that faithfully — 34 of 39 — which is the detail that
 * made the gap expensive. Every RLS spec in this directory was green, because
 * each was scoped to tables that did have RLS. A property asserted over a subset
 * the author chose cannot detect a member missing from the set.
 *
 * ─── WHY THE COUNT IS PINNED AND NOT DERIVED ────────────────────────────────
 *
 * `expect(noRlsTables).toEqual([])` is the shape that fails when a table loses
 * RLS. The count pinned alongside it is the shape that fails when the harness
 * stops reproducing production at all: a `[]` is also what a database where the
 * replay quietly collapsed would return, so the empty set alone is ambiguous
 * between "fully covered" and "barely built". Both are asserted, and the count
 * is what disambiguates them.
 *
 * `public._harness_fingerprint` is excluded by name. It is created by
 * `createSupabaseTestDb` AFTER the replay, to cache the template fingerprint,
 * and it has no RLS and no business being in a count that describes the product
 * schema. The exclusion is a literal rather than a `not like` pattern so a real
 * product table cannot be swallowed by it.
 *
 * ─── WHY app_store IS NOT IN THE SAME SHAPE ANYMORE ─────────────────────────
 *
 * The list above is history, not current state, and one name on it has since
 * changed shape. `20260930234450_bug_reports_and_delivery_axis.sql` revoked
 * SELECT on `app_store` from `anon` and `authenticated`, and added the single
 * policy "Users submit bug reports", which is `FOR INSERT`. `app_store` was the
 * last member of this file's second group — the table that was closed by RLS
 * alone, because both client roles held SELECT from the platform default ACL.
 * It is no longer in that group, and the two tests below say so rather than
 * leaving the old shape asserted under a comment that has stopped being true.
 * The list of five is left exactly as it was, because it describes what
 * `20260928184943` was for; editing it would put a claim about a later
 * migration inside a comment about that one.
 */

let ctx: SupabaseTestDb;

/**
 * postgres.js answers with a `RowList`, an array that also carries query
 * metadata, and `toEqual` compares the metadata too. Same normalisation as the
 * other specs: spread it.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
});

afterAll(async () => {
  await ctx.stop();
});

describe('no table in public is left without RLS', () => {
  /**
   * The invariant, as an empty result set.
   *
   * Asserted over `pg_class` rather than against a list of expected tables,
   * because a list is the failure mode: it is correct on the day it is written
   * and silently incomplete the day a table is added. Here a new table in
   * `public` is covered by this assertion the moment it exists, and a table
   * that LOSES RLS is reported by name.
   *
   * The anti-vacuity guard is load-bearing and comes first. This query returns
   * `[]` for a database where the replay produced nothing, where the schema is
   * misspelled, or where the guard itself is wrong — and a green empty set is
   * the exact shape a broken assertion produces. So the denominator is proven
   * real before the numerator is proven clean.
   */
  test('every table in public has row level security enabled', async () => {
    const withoutRls = await ctx.sql.unsafe<{ relname: string }[]>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity
          and c.relname <> '_harness_fingerprint'
        order by c.relname`,
    );

    const total = await ctx.sql.unsafe<{ c: number }[]>(
      `select count(*)::int as c
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> '_harness_fingerprint'`,
    );

    expect(
      plainRows(total)[0]?.c,
      'public holds no ordinary tables, so "none is without RLS" is true for a ' +
        'reason that has nothing to do with RLS. This file would be asserting ' +
        'against an empty schema.',
    ).toBe(41);

    expect(
      plainRows(withoutRls).map((r) => r.relname),
      'a table in public has no row level security. Either a migration enabled ' +
        'RLS somewhere outside this directory, or a table was created without ' +
        'the ALTER that the ledger needs in order to reproduce it — which is ' +
        'the exact gap 20260928184943 exists to close, arriving again.',
    ).toEqual([]);
  });

  /**
   * The same property as a count, because a count fails differently.
   *
   * The empty-set assertion above names the table. This one names the number,
   * and it is the assertion that makes the destructive-privileges migration's
   * coverage demonstrable: that migration iterates `pg_class` filtered on
   * `relrowsecurity`, so it can only be shown to cover every table in `public`
   * if every table in `public` has RLS. For as long as the five were missing,
   * that migration was proven over 34 tables in this harness while running over
   * 39 in production.
   */
  test('the harness reproduces production coverage: 41 of 41', async () => {
    const counts = await ctx.sql.unsafe<{ total: number; with_rls: number }[]>(
      `select count(*)::int as total,
              count(*) filter (where c.relrowsecurity)::int as with_rls
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> '_harness_fingerprint'`,
    );

    expect(plainRows(counts)[0]).toEqual({ total: 41, with_rls: 41 });
  });
});

describe('no client role can read any of the three, and they deny for different reasons', () => {
  /**
   * The deny, pinned, WITH the asymmetry stated.
   *
   * All three tables are unreadable from a client role, and the temptation is to
   * write one test that says so and call the finding uniform. It is not uniform,
   * and the difference is the whole security posture:
   *
   *   business_finance, business_moderation — TWO layers, and nothing is granted.
   *     `20260925225227` does `revoke all ... from anon, authenticated`, so a
   *     client role holds no privilege at all and is refused at the table ACL
   *     before RLS is consulted. Enabling RLS adds a second layer over the
   *     first: a future migration that grants SELECT would still not expose the
   *     balance or the verification state, because no policy would admit a row.
   *     These two are the tables phase 3 created to hide money and moderation
   *     state, so the pin exists to make "somebody granted SELECT and it did not
   *     matter" a fact rather than a hope.
   *
   *   app_store — TWO layers as well, over a table that DOES carry a policy, and
   *     that is the change. Until `20260930234450` this was the odd one out:
   *     both client roles held SELECT from the platform default ACL and RLS
   *     with no policies was the ONLY wall, so a single mistaken GRANT — or one
   *     permissive SELECT policy written by somebody trying to "fix" the empty
   *     result set — would have published the contact inbox to anyone holding
   *     the anon key, which ships inside the mobile bundle. That migration
   *     revoked SELECT and added "Users submit bug reports", the one policy that
   *     opens a write, because a client has to be able to file a bug report
   *     straight to Supabase and read nothing back.
   *
   *     So the policy count is 1, and the count on its own is not the security
   *     fact. The fact is which COMMAND that policy is for: it is FOR INSERT.
   *     There is still no SELECT policy, which is what makes the second layer
   *     survive a stray GRANT — and that is not a new claim, it is the property
   *     the previous version of the second test in this block proved by
   *     accident, when it put a row in as the owner and watched `anon` read
   *     zero of them with the grant wide open. The command is asserted by name
   *     in the test below rather than left to the count, because a count cannot
   *     tell an added policy from a substituted one.
   *
   * `has_table_privilege` is the live-session form of the question and the
   * grantor-specific form of the answer: it is evaluated for the named role, so
   * it sees the effective privilege rather than the ACL as written.
   */
  test('all three are closed twice over, and app_store is closed by its missing SELECT policy', async () => {
    const shape = await ctx.sql.unsafe<
      {
        relname: string;
        policies: number;
        commands: string;
        anon_select: boolean;
        authenticated_select: boolean;
      }[]
    >(
      `select t.relname,
              (select count(*)
                 from pg_policies p
                where p.schemaname = 'public'
                  and p.tablename = t.relname)::int as policies,
              coalesce((select string_agg(p.cmd, ',' order by p.cmd)
                 from pg_policies p
                where p.schemaname = 'public'
                  and p.tablename = t.relname), '') as commands,
              has_table_privilege('anon', t.oid, 'SELECT')            as anon_select,
              has_table_privilege('authenticated', t.oid, 'SELECT') as authenticated_select
         from pg_class t
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname in ('app_store', 'business_finance', 'business_moderation')
        order by t.relname`,
    );

    // Spelled out as the full shape, all three tables, so the asymmetry is
    // visible in one diff. A test asserting "policies = 0" for the three, and
    // nothing else, would pass while the SELECT grants were inverted — which is
    // the failure this assertion is shaped to catch.
    //
    // `app_store` is the only row whose numbers moved: 0 to 1 policies, true to
    // false on both SELECT grants. The count is asserted rather than dropped so
    // that a SECOND policy arriving here is a visible diff, and so a reader who
    // has not seen the migration can see that this table is no longer a no-policy
    // table.
    //
    // `commands` is the column that carries the name of this test, and it is here
    // because a count does not. Drop "Users submit bug reports" and create a
    // permissive SELECT policy in its place and the count is still 1,
    // `has_table_privilege` is still false, and BOTH tests in this block stay
    // green while the contact inbox — and the `reporter_id` values inside a bug
    // report — is one query away from anyone holding the anon key. The count
    // catches an ADDED policy and never a SUBSTITUTED one, so the commands are
    // aggregated and spelled out beside it. `''` is the value for a table with no
    // policies at all, which is the shape the other two rows must keep.
    expect(plainRows(shape)).toEqual([
      {
        relname: 'app_store',
        policies: 1,
        commands: 'INSERT',
        anon_select: false,
        authenticated_select: false,
      },
      {
        relname: 'business_finance',
        policies: 0,
        commands: '',
        anon_select: false,
        authenticated_select: false,
      },
      {
        relname: 'business_moderation',
        policies: 0,
        commands: '',
        anon_select: false,
        authenticated_select: false,
      },
    ]);
  });

  /**
   * The same thing as a refusal rather than as a number, for the two tables
   * where the ACL has always been the first line.
   *
   * `42501` is `insufficient_privilege`, and the message names the TABLE rather
   * than a column or a policy — which is how you tell a client role was stopped
   * at the grant from a client role that reached the row and was filtered by
   * RLS. The two are different failures with different fixes, and an assertion
   * that only checked "not null" would not tell them apart. `app_store` is now
   * stopped at the grant too, and the test below uses the same shape for it.
   */
  test('anon and authenticated are refused SELECT on the two revoked tables by name', async () => {
    for (const table of ['business_finance', 'business_moderation']) {
      for (const role of ['anon', 'authenticated'] as const) {
        const denied = await deniedAs(ctx.sql, role, null, (tx) =>
          tx.unsafe(`select * from public.${table}`),
        );

        expect(
          denied,
          `${role} read public.${table} successfully. That table holds the ` +
            'balance and commission rate, or the verification state, and it is ' +
            'meant to be unreachable from a client role.',
        ).not.toBeNull();

        expect(
          denied?.code,
          `${role} read public.${table} without an error. That table holds the ` +
            'balance and commission rate, or the verification state, and it is ' +
            'meant to be unreachable from a client role.',
        ).toBe('42501');
        expect(denied?.message).toContain(
          `permission denied for table ${table}`,
        );
      }
    }
  });

  /**
   * `app_store`, which is write-only for clients: a role may file a report and
   * may read nothing back.
   *
   * The denial moved up a layer, and that is the whole difference from the test
   * that used to live here. Before `20260930234450` the privilege was real:
   * `anon` held SELECT and was stopped per row by RLS, so the only honest way to
   * say "the row is hidden" was to put a row in and count zero, because a
   * catalog assertion could not distinguish a hidden row from a granted table.
   * Now the refusal happens at the table ACL, before any row is considered, so
   * it is observable without writing anything and it is the same `42501` the
   * two revoked tables produce — which is why this uses `deniedAs` and asserts
   * the code and the table name.
   *
   * The property being pinned is the pairing, and it is easy to break from
   * either side. A migration that granted SELECT back would make every client
   * role able to read the contact inbox, including the bug reports and the
   * reporter ids inside them. A migration that added a permissive SELECT policy
   * "so the user can see their own report" would do the same thing while
   * `has_table_privilege` still said false, which is why the count above is
   * asserted next to the grants and not instead of them.
   *
   * The row is still seeded, and still as the OWNER, because "no role may read
   * this table" and "this table has something in it" are different facts and
   * the second one is what makes the first worth reading. The owner proves the
   * row is there; the client roles are then refused the whole table.
   *
   * The `finally` runs as the owner, and `deniedAs` is deliberately NOT used
   * for the cleanup, for the reason `destructive-privileges.rls.db.spec.ts`
   * documents at length: `as()` runs its callback inside `sql.begin()` and
   * postgres.js COMMITS when the callback resolves, so a helper whose comment
   * claims the transaction always rolls back commits on the success path. Two
   * writers have already been burned by that. The row's absence is asserted
   * afterwards rather than assumed.
   */
  test('app_store is write-only for clients: both roles are refused SELECT, with a row in the table', async () => {
    const probe = 'rls_enable_probe';

    const before = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store where namespace = '${probe}'`,
    );
    expect(plainRows(before)[0]?.n, 'probe namespace already present').toBe(0);

    await ctx.sql.unsafe(
      `insert into public.app_store (namespace, key, value)
       values ('${probe}', 'probe_key', '{}'::jsonb)`,
    );

    try {
      // The owner sees it, so the refusals below are about the ROLE and not
      // about a table that happens to be empty. Without this the assertions
      // would be empty-set-shaped and would pass against a database where the
      // insert silently did nothing.
      const asOwner = await ctx.sql.unsafe<{ n: number }[]>(
        `select count(*)::int as n from public.app_store where namespace = '${probe}'`,
      );
      expect(plainRows(asOwner)[0]?.n).toBe(1);

      // And no client role reaches the table at all. One `deniedAs` per role,
      // not two statements in one transaction: a refused statement leaves its
      // transaction aborted, so the next statement in the SAME one would fail
      // with 25P02 and read as a second denial that never happened.
      for (const role of ['anon', 'authenticated'] as const) {
        const denied = await deniedAs(ctx.sql, role, null, (tx) =>
          tx.unsafe(
            `select count(*)::int as n from public.app_store where namespace = '${probe}'`,
          ),
        );

        expect(
          denied,
          `${role} read public.app_store. The app store is the contact inbox and ` +
            'the bug-report queue: a client is meant to be able to file a report ' +
            'and to read nothing back, not even its own row.',
        ).not.toBeNull();

        expect(
          denied?.code,
          `${role} read public.app_store without an error. The table is ` +
            'write-only for clients by design, so a successful read here means a ' +
            'SELECT grant or a permissive SELECT policy came back.',
        ).toBe('42501');
        expect(denied?.message).toContain(
          'permission denied for table app_store',
        );
      }

      // The privilege is absent, which is the layer a row count can no longer
      // demonstrate. Asserting it is not the same as asserting the denial: the
      // denial is the two `42501`s above, and this is the reason they name a
      // table rather than returning an empty set.
      const granted = await ctx.sql.unsafe<{ anon: boolean; auth: boolean }[]>(
        `select has_table_privilege('anon', 'public.app_store', 'SELECT')            as anon,
                has_table_privilege('authenticated', 'public.app_store', 'SELECT') as auth`,
      );
      expect(plainRows(granted)[0]).toEqual({ anon: false, auth: false });
    } finally {
      await ctx.sql
        .unsafe(`delete from public.app_store where namespace = '${probe}'`)
        .catch(() => {});
    }

    const after = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store where namespace = '${probe}'`,
    );
    expect(
      plainRows(after)[0]?.n,
      'the probe row is still in app_store. Every later assertion in this file ' +
        'would be measuring it.',
    ).toBe(0);
  });
});

describe('rls_auto_enable() exists in production and is connected to nothing', () => {
  /**
   * The function a reader would assume closes this gap permanently. It does not.
   *
   * `public.rls_auto_enable()` exists in production. It is attached to NO event
   * trigger: `select evtname from pg_event_trigger` returns zero rows. A function
   * nothing invokes executes on nothing, so it is not what enables RLS on a new
   * table, in production or anywhere else.
   *
   * This is pinned as a test rather than left as a comment because the name is
   * actively misleading. Someone auditing "is RLS automatic here?" will find a
   * function called `rls_auto_enable`, read the name, and conclude the answer is
   * yes — and therefore that a new table is covered without anyone writing an
   * ALTER. That belief is false, and the cost of holding it is a table created
   * without RLS. The assertion is on the TRIGGER count rather than on the
   * function's existence, because the trigger count is what makes coverage a
   * manual obligation: the function may exist, may be correct, and still fire
   * zero times.
   *
   * The function is absent from the harness entirely, so the assertion cannot be
   * "the function exists and has no trigger" — that would be red here and green
   * in production for reasons that have nothing to do with the finding. It is
   * written so both environments answer the question that matters: nothing in
   * this database would enable RLS automatically.
   */
  test('no event trigger would enable RLS on a new table, in this database or in production', async () => {
    const triggers = await ctx.sql.unsafe<{ evtname: string }[]>(
      `select evtname from pg_event_trigger order by evtname`,
    );

    expect(
      plainRows(triggers).map((t) => t.evtname),
      'an event trigger is installed. If it invokes rls_auto_enable(), new ' +
        'tables are covered automatically and the ledger no longer has to ' +
        'remember them; if it does something else, it is unmeasured here. ' +
        'Either way, this assertion is the one that has to be re-examined, ' +
        'because it is what currently proves that enabling RLS is a MANUAL ' +
        'obligation in this project.',
    ).toEqual([]);

    // The function is recorded as absent rather than asserted absent. Production
    // has it and the harness does not, and a test that demanded its presence
    // would be describing one database while running against another. What is
    // asserted is the count, because a dangling function is not a control.
    const fn = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'rls_auto_enable'`,
    );
    expect(plainRows(fn)[0]?.n).toBe(0);
  });
});
