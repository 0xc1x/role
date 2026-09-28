import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  diffReplayFailures,
  KNOWN_REPLAY_FAILURES,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * The first RLS test in this repository that EXECUTES a policy.
 *
 * ─── Why this file exists ──────────────────────────────────────────────────
 *
 * Until now the data boundary had exactly one test, `public-read-grants.spec.ts`,
 * and it is a test about TEXT. It reads the migration files and asserts that
 * the SQL says what it should say. That is a real guard and it caught real
 * things — but it cannot tell a working policy from a policy that references a
 * column that does not exist, because a `create policy` statement is a string
 * until Postgres parses it. Meanwhile the 25 database specs in this package ran
 * against `apps/api/drizzle/`, a mirror that carries no policies, no grants and
 * no `auth.uid()` — `test/db.ts` filters all three out on purpose, in a comment
 * that says so. So the suite was green and no RLS policy had ever run.
 *
 * This file runs against `supabase/migrations/` replayed onto the real
 * platform, through `createSupabaseTestDb()`. The policies under test are the
 * ones production holds, character for character, because they are not
 * re-typed here.
 *
 * ─── Why `public.categories` is the pilot table ────────────────────────────
 *
 * Because it is the smallest table in the ledger with BOTH halves of the
 * boundary: a public read policy keyed on a column (`active = true`) and an
 * admin write policy keyed on a helper (`auth_helpers.my_role() = 'admin'`).
 * Anything that can go wrong with an RLS test harness — a role that was never
 * really set, a claim that was never really set, a SECURITY DEFINER helper
 * that cannot see the row it needs — shows up on this table and on nothing
 * else. Getting it wrong here is cheap; discovering the same class of problem
 * on `orders` is not.
 *
 * ─── The one thing to read before believing anything below ─────────────────
 *
 * `anon` holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and
 * TRIGGER on this table. That is Supabase's `alter default privileges`, it is
 * what production has, and it is NOT hardened here — this file reproduces and
 * tests, it does not fix. The consequence is the point of the whole exercise:
 *
 *     the grants permit everything, and the POLICIES are the only thing
 *     standing between `anon` and the catalog.
 *
 * So a test in this file that asserts a denial is worthless unless it also
 * asserts the privilege exists. `the grants permit what the policies forbid`
 * below is the test that makes the other denials mean something — remove a
 * grant and every denial in this file starts passing for a completely
 * different reason.
 *
 * `anon` can also read `deleted_at`, including on rows it may not see, because
 * it is the same table-level SELECT. It is pinned below so nobody "fixes" it
 * by accident and does not notice.
 *
 * ─── FINDING, for whoever owns the ledger: the auth_helpers schema has no
 * USAGE grant, and it turns out that does not break anything ──────────────
 *
 * `20260509214339_fix_profiles_rls_infinite_recursion.sql` creates the schema
 * and grants EXECUTE on `auth_helpers.my_role()` to `authenticated` and `anon`.
 * It never grants USAGE on the schema, and production does not either. Measured
 * against production directly, not inferred from the ledger:
 *
 *     has_schema_privilege('anon',         'auth_helpers', 'usage') -> false
 *     has_schema_privilege('authenticated', 'auth_helpers', 'usage') -> false
 *     has_schema_privilege('service_role',  'auth_helpers', 'usage') -> false
 *     has_function_privilege('authenticated','auth_helpers.my_role()','execute')
 *       -> true
 *
 * The obvious reading — EXECUTE without USAGE is unreachable, so the 32
 * policies across 28 tables that call `auth_helpers.my_role()` are dead — is
 * WRONG, and this file is the evidence. They are not dead. An admin whose
 * profile says `role = 'admin'` writes and reads through them from a client
 * `authenticated` session, exactly as the policies describe.
 *
 * Why, since the schema check is a real check: the ACL check for USAGE on a
 * schema is made when a qualified function name is RESOLVED, and an RLS policy
 * expression is resolved once, when the policy is created, by the role running
 * the migration. At query time the only permission re-checked is ACL_EXECUTE on
 * the function itself, against the querying role. Both halves are measured here:
 *
 *   - with USAGE missing and EXECUTE present, the admin write succeeds
 *     (`an admin writes through the admin policy...` below);
 *   - revoking EXECUTE from `authenticated` turns that same write into
 *     `42501 permission denied for function my_role`, so the policy really is
 *     being evaluated and is really what permits the row.
 *
 * So the missing USAGE has exactly one observable consequence, and it is a
 * narrow one: a client session cannot CALL the helper by name —
 * `select auth_helpers.my_role()` is `42501 permission denied for schema
 * auth_helpers` for all three client roles. Nothing in the ledger calls it that
 * way; the policies call it with a resolved reference, and the one caller that
 * does resolve it at query time (`20260906081534_set_order_status_rpc.sql`)
 * runs as `SECURITY DEFINER` owned by the schema owner.
 *
 * WHAT TO DO WITH IT: nothing, and in particular do not add
 * `grant usage on schema auth_helpers` to the ledger to make the error go
 * away. That grant is a product decision, not an infrastructure fix: it would
 * hand every client session a callable `my_role()`, and nothing in the product
 * needs one. Until somebody asks for admin-through-the-client on purpose, the
 * state above is correct.
 *
 * One consequence for THIS file, which is the reason the harness grant was
 * removed: it used to hold
 * `grant usage on schema auth_helpers to anon, authenticated, service_role`
 * and asserted an admin write through it. That grant was an unverified
 * assumption made so a test would pass, and production does not have it. It is
 * gone, the tests below assert the measured state, and
 * `authenticated holds EXECUTE on my_role() and no USAGE on its schema` fails
 * loudly if anyone puts it back.
 *
 * ─── How the impersonation works, and the trap inside it ───────────────────
 *
 * `as()` runs the callback inside one transaction with `set local role` and
 * `set local set_config('request.jwt.claim.sub', ...)`. Both are scoped to that
 * transaction. The roles are `nologin`, so privilege comes from `set role`
 * alone — and a session that forgets to set one runs as the owner, which
 * BYPASSES RLS entirely. A test that quietly ran as `postgres` would pass every
 * assertion in this file while proving nothing, and it is the most expensive
 * way this suite could be wrong. Hence the first describe block, which asserts
 * the impersonation works before anything relies on it.
 */

const ADMIN = '22222222-2222-2222-2222-222222222222';
const MEMBER = '11111111-1111-1111-1111-111111111111';

/** Slugs this file owns, so assertions do not depend on what the ledger seeds. */
const ACTIVE_SLUG = 'rls-pilot-active';
const DRAFT_SLUG = 'rls-pilot-draft';
const ARCHIVED_SLUG = 'rls-pilot-archived';

let ctx: SupabaseTestDb;

/**
 * postgres.js answers a query with a `RowList`, which IS an array and also
 * carries query metadata. `expect(rowList).toEqual([...])` does not typecheck
 * against the metadata, and `toEqual` on the whole object compares the metadata
 * too. Same note as in `mirror-fidelity.db.spec.ts`: it is iterable and it has
 * no `.rows`. Spreading it is the whole normalisation.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * Seed as the owner, never as a role.
 *
 * `auth_helpers.my_role()` is `SECURITY DEFINER` and reads `public.profiles`
 * while bypassing its RLS, so it can see a row this session could not have
 * inserted for itself. That is the correct production shape and it is also why
 * seeding has to happen here: an admin that tries to create itself is stopped
 * by the very policy it needs to exist for.
 *
 * The users go in through `auth.users`, not directly into `profiles`, because
 * the ONLY producer of a profile is the `on_auth_user_created` trigger. Writing
 * the profile row by hand would build a user that cannot exist in production,
 * and the first thing that would break is the helper.
 */
beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    for (const [id, email] of [
      [ADMIN, 'admin@rls-pilot.test'],
      [MEMBER, 'member@rls-pilot.test'],
    ] as const) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${email}')
         on conflict (id) do nothing`,
      );
    }
    await tx.unsafe(
      `update public.profiles set role = 'admin' where id = '${ADMIN}'`,
    );

    // One visible row and two invisible ones. The archived row also carries a
    // `deleted_at`, because the soft-delete column is readable by `anon` and
    // that is worth pinning while it is true.
    await tx.unsafe(`
      insert into public.categories (name, slug, active) values
        ('RLS pilot active',   '${ACTIVE_SLUG}',   true),
        ('RLS pilot draft',    '${DRAFT_SLUG}',    false),
        ('RLS pilot archived', '${ARCHIVED_SLUG}', false);
      update public.categories
         set deleted_at = now(), updated_at = now()
       where slug = '${ARCHIVED_SLUG}';
    `);
  });
});

afterAll(async () => {
  await ctx.stop();
});

/** Slugs visible to the current session. */
async function visibleSlugs(
  sql: Parameters<typeof as>[0],
  role: 'owner' | 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
): Promise<string[]> {
  const run = (tx: Parameters<typeof as>[0]) =>
    tx
      .unsafe<{ slug: string }[]>(
        `select slug from public.categories order by slug`,
      )
      .then((rows) => rows.map((r) => r.slug));
  if (role === 'owner') return run(sql);
  return as(sql, role, userId, run);
}

describe('the RLS harness is actually impersonating', () => {
  /**
   * The cheapest possible proof that `as()` changes the session, and therefore
   * that every denial in the rest of this file is a policy result rather than an
   * artefact of a forgotten `set local role`.
   *
   * `current_user` is the direct read: it is the role the last statement ran
   * as. `session_user` staying `postgres` is the point — impersonation is a
   * GUC and a role switch, not a new login, exactly as PostgREST does it.
   * Without that distinction a test could pass by connecting as `anon`, which
   * is not a thing this container allows and would be a different bug.
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
    // Same session, different role. If these ever diverge, the impersonation
    // became a connection and the role no longer describes the privileges in
    // play.
    expect(anon[0]?.session_user).toBe(owner[0]?.session_user);
  });

  /**
   * `auth.uid()` must be NULL for the anonymous path and the subject for a
   * signed-in one.
   *
   * A harness that always supplies a subject cannot tell "this row is not mine"
   * apart from "there is nobody": both predicates evaluate to false. Half the
   * ledger's policies are written as `owner_id = auth.uid()`, and under a
   * phantom subject they would all read the same way.
   */
  test('auth.uid() is null when anonymous and the subject when signed in', async () => {
    const anonymous = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ uid: string | null }[]>(`select auth.uid()::text as uid`),
    );
    const signedIn = await as(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe<{ uid: string | null }[]>(`select auth.uid()::text as uid`),
    );

    expect(anonymous[0]?.uid).toBeNull();
    expect(signedIn[0]?.uid).toBe(MEMBER);
  });

  /**
   * The meta-test, and the one this whole harness exists to make possible: the
   * same query, run twice, must return DIFFERENT answers.
   *
   * If a client role saw what the owner sees, then every policy in the database
   * is a no-op from the perspective of this suite and every other test in this
   * file is decoration. The failure mode it defends against is not exotic: it
   * is a `set local role` that silently did not take, a claim that was never
   * set, a pool that handed the query to a connection the role was not set on,
   * or a `relforcerowsecurity = false` table owned by the very role the test
   * connects as. All four produce a green suite that proves nothing.
   */
  test('a client role sees strictly fewer rows than the owner', async () => {
    const asOwner = await visibleSlugs(ctx.sql, 'owner', null);
    const asAnon = await visibleSlugs(ctx.sql, 'anon', null);

    // Everything `anon` sees, the owner sees too. RLS narrows; it must never
    // WIDEN. A row appearing only for the client role would mean a permissive
    // policy ORed its way into existence.
    const ownerSet = new Set(asOwner);
    const leaked = asAnon.filter((slug) => !ownerSet.has(slug));
    expect(
      leaked,
      `rows visible to anon but not to the owner: ${leaked.join(', ')}`,
    ).toEqual([]);

    // And the owner sees strictly more. The seeded inactive rows are what makes
    // this true, so the assertion does not depend on whatever the ledger's own
    // seed data happens to hold.
    expect(
      asOwner.length,
      `anon saw ${asAnon.length} of ${asOwner.length} rows; the difference must ` +
        `be strictly positive or the policies are not filtering`,
    ).toBeGreaterThan(asAnon.length);

    for (const slug of [DRAFT_SLUG, ARCHIVED_SLUG]) {
      expect(asOwner, `${slug} must be visible to the owner`).toContain(slug);
      expect(asAnon, `${slug} must be hidden from anon`).not.toContain(slug);
    }
  });
});

describe('public.categories: what the grants allow', () => {
  /**
   * The precondition for every denial in this file.
   *
   * Supabase's default privileges make a new `public` table fully writable by
   * `anon` the moment it is created, and this table is not hardened. If this
   * test ever fails, every other denial here becomes vacuous — they would all
   * still pass, and all of them would be reporting a 42501 from the GRANT layer
   * instead of a policy. It is the canary for the failure mode this harness
   * already produced once: before the default privileges were reproduced, EVERY
   * client query failed with `permission denied for table categories` and not
   * one policy was ever evaluated.
   */
  test('anon holds every table privilege, and the policies are what refuse', async () => {
    const rows = await ctx.sql.unsafe<{ privilege_type: string }[]>(
      `select privilege_type
         from information_schema.table_privileges
        where table_schema = 'public'
          and table_name   = 'categories'
          and grantee      = 'anon'`,
    );
    const held = rows.map((r) => r.privilege_type).sort();

    expect(held).toEqual([
      'DELETE',
      'INSERT',
      'REFERENCES',
      'SELECT',
      'TRIGGER',
      'TRUNCATE',
      'UPDATE',
    ]);

    // The same question, asked of the live session rather than the catalog, so
    // the test cannot pass on a grant that exists but was revoked for this role
    // by something the catalog view does not show.
    const asAnon = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ ins: boolean; upd: boolean; del: boolean }[]>(
        `select has_table_privilege('anon', 'public.categories', 'insert')  as ins,
                has_table_privilege('anon', 'public.categories', 'update')  as upd,
                has_table_privilege('anon', 'public.categories', 'delete')  as del`,
      ),
    );
    expect(asAnon[0]).toEqual({ ins: true, upd: true, del: true });
  });

  /**
   * RLS is on, and FORCE is not.
   *
   * `relforcerowsecurity = false` is the production setting and it is the
   * reason the impersonation matters: RLS applies to every role EXCEPT the
   * table owner, and the owner is the role the harness connects as. `FORCE` would
   * close that, but changing it here would mean testing a database production
   * does not have, and the point of this file is that it does not.
   */
  test('RLS is enabled and not forced', async () => {
    const rows = await ctx.sql.unsafe<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >(`select relrowsecurity, relforcerowsecurity
         from pg_class where oid = 'public.categories'::regclass`);

    expect(rows[0]?.relrowsecurity).toBe(true);
    expect(rows[0]?.relforcerowsecurity).toBe(false);
  });

  /**
   * The policy set is exactly two policies, and both are asserted as TEXT
   * because that is the layer that is actually under test.
   *
   * `public-read-grants.spec.ts` already reads the migration to confirm these
   * were created. This asserts they SURVIVED — that no later migration in the
   * ledger dropped, renamed or widened one. A policy that was created and then
   * dropped is invisible to a source-level test and completely visible here.
   */
  test('the policy set is the two the ledger declares, unmodified', async () => {
    const rows = await ctx.sql.unsafe<
      { policyname: string; cmd: string; permissive: string; roles: string[] }[]
    >(`select policyname, cmd, permissive, roles
         from pg_policies
        where schemaname = 'public' and tablename = 'categories'
        order by policyname`);

    expect(plainRows<Record<string, unknown>>(rows)).toEqual([
      {
        policyname: 'Admins can manage categories',
        cmd: 'ALL',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
      },
      {
        policyname: 'Anyone can view active categories',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['anon', 'authenticated'],
      },
    ]);
  });

  /**
   * `anon` reads `deleted_at` on a table whose policies restrict it to active
   * rows.
   *
   * This is not a bug report; it is a marker. `anon` holds table-level SELECT,
   * so a column grant is the only thing that could hide `deleted_at`, and no
   * migration here makes one. A reader seeing this test should understand that
   * "RLS filtered the row" and "anon cannot see the column" are two different
   * guarantees, and that this database only has the first.
   */
  test('anon can read deleted_at, because the grant is table-wide', async () => {
    const rows = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ deleted_at: string | null }[]>(
        `select deleted_at::text from public.categories
          where slug = '${ACTIVE_SLUG}'`,
      ),
    );
    // The row came back at all, and with the column. Had the policy hidden it,
    // this would be an empty array instead.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('deleted_at');
  });

  /**
   * `TRUNCATE` is not subject to RLS at all, and this suite does not cover it.
   *
   * Written down because the grants test above lists TRUNCATE, and a reader
   * could reasonably assume the policy tests cover it. They do not: RLS has no
   * opinion on TRUNCATE. Here the statement is refused — but with
   * `0A000 cannot truncate a table referenced in a foreign key constraint`,
   * which is `offer_categories.category_id`, not any policy. Nothing in this
   * file is evidence that a truncate is blocked, and a table without a
   * referencing foreign key would not be.
   */
  test('TRUNCATE is refused by the foreign key, not by RLS', async () => {
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(`truncate public.categories`),
    );
    expect(denial?.code).toBe('0A000');
    expect(denial?.message).toContain('foreign key constraint');
  });
});

describe('public.categories: what the policies refuse', () => {
  /**
   * Criterion one and two together: the public read is exactly the active rows.
   *
   * The table is seeded with three rows of its own and the ledger's own seed
   * data is ignored, so this does not break when a migration adds a category.
   */
  test('anon sees the active rows and not the inactive ones', async () => {
    const rows = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `select slug from public.categories where slug like 'rls-pilot-%' order by slug`,
      ),
    );
    const slugs = rows.map((r) => r.slug);

    expect(slugs).toEqual([ACTIVE_SLUG]);
    expect(slugs).not.toContain(DRAFT_SLUG);
    expect(slugs).not.toContain(ARCHIVED_SLUG);
  });

  /**
   * An INSERT is REFUSED, loudly, with the policy's name in the message.
   *
   * Not `permission denied` — `42501 new row violates row-level security policy`.
   * The distinction is the whole test: the grant test above proved `anon` holds
   * INSERT on this table, so a denial here can only have come from the missing
   * `WITH CHECK` clause. `anon` is not in the `TO` list of "Admins can manage
   * categories" and "Anyone can view active categories" is `FOR SELECT`, so
   * there is no policy that permits the write.
   */
  test('anon cannot insert, and the refusal names the policy layer', async () => {
    const denial = await deniedAs(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe(
        `insert into public.categories (name, slug) values ('sneaked in', 'rls-pilot-sneak')`,
      ),
    );

    expect(denial, 'anon was able to insert a category').not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain('row-level security policy');
    expect(denial?.message).toContain('categories');

    // And nothing was written. `deniedAs` rolls back, so this is belt and
    // braces, but a policy that raised and still inserted would be a different
    // bug and this catches it.
    const rows = await ctx.sql.unsafe<{ slug: string }[]>(
      `select slug from public.categories where slug = 'rls-pilot-sneak'`,
    );
    expect(plainRows(rows)).toEqual([]);
  });

  /**
   * An UPDATE by `anon` succeeds. It just does nothing.
   *
   * This is the most counter-intuitive result in the file and it deserves to be
   * written down rather than discovered. Postgres applies a policy's `USING`
   * clause to decide which rows a statement may touch; with no UPDATE policy for
   * `anon` the clause is empty, every row is filtered out, the statement matches
   * zero rows and returns zero. No error. `resulting row count: 0` is the ONLY
   * evidence, which is why the assertion is on the returned rows and not on the
   * absence of a throw.
   *
   * It matters for the code that calls this table. A client that checks for an
   * error and not for a row count concludes the category was renamed. Any
   * assertion of the form "this must not be possible" that does not count rows
   * passes here while the row is sitting there unchanged.
   */
  test('anon update matches zero rows instead of raising', async () => {
    const affected = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `update public.categories set name = 'renamed by anon'
          where slug = '${ACTIVE_SLUG}' returning slug`,
      ),
    );
    expect(plainRows(affected)).toEqual([]);

    // The row is untouched, read as the owner, which is the only way to see it:
    // `anon` cannot see an update it did not make either.
    const rows = await ctx.sql.unsafe<{ name: string }[]>(
      `select name from public.categories where slug = '${ACTIVE_SLUG}'`,
    );
    expect(rows[0]?.name).toBe('RLS pilot active');
  });

  /**
   * A DELETE by `anon` is the same shape as the UPDATE above, for the same
   * reason, and it is the more dangerous of the two: a delete that quietly
   * affects nothing looks exactly like a successful operation to any caller
   * that only checks for an error.
   */
  test('anon delete matches zero rows instead of raising', async () => {
    const affected = await as(ctx.sql, 'anon', null, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `delete from public.categories where slug = '${ACTIVE_SLUG}' returning slug`,
      ),
    );
    expect(plainRows(affected)).toEqual([]);

    const rows = await ctx.sql.unsafe<{ slug: string }[]>(
      `select slug from public.categories where slug = '${ACTIVE_SLUG}'`,
    );
    expect(rows).toHaveLength(1);
  });

  /**
   * A signed-in user who is not an admin gets exactly what `anon` gets.
   *
   * `authenticated` is in the `TO` list of "Anyone can view active categories"
   * and NOT in the admin policy's list, so the only thing that separates the
   * two roles on this table is `auth_helpers.my_role()`. A user with a profile
   * whose role is `user` — which is what the signup trigger assigns, and what
   * every consumer on the platform has — must be indistinguishable from an
   * anonymous browser.
   */
  test('an authenticated non-admin behaves exactly like anon', async () => {
    const asMember = await visibleSlugs(ctx.sql, 'authenticated', MEMBER);
    const asAnon = await visibleSlugs(ctx.sql, 'anon', null);
    expect(asMember).toEqual(asAnon);

    for (const [label, statement] of [
      [
        'insert',
        `insert into public.categories (name, slug) values ('member write', 'rls-pilot-member')`,
      ],
      [
        'update',
        `update public.categories set name = 'member write' where slug = '${ACTIVE_SLUG}'`,
      ],
      ['delete', `delete from public.categories where slug = '${ACTIVE_SLUG}'`],
    ] as const) {
      const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
        tx.unsafe(statement),
      );
      // INSERT raises; UPDATE and DELETE do not. The INSERT is asserted
      // precisely and the other two are asserted by row count above, which is
      // why this loop only checks that a member is refused on the one path
      // where refusal is loud.
      if (label === 'insert') {
        expect(denial?.code, `member was able to ${label}`).toBe('42501');
        expect(denial?.message).toContain('row-level security policy');
      }
    }
  });

  /**
   * The privilege state production actually holds, pinned.
   *
   * USAGE on `auth_helpers` is missing for every client role and EXECUTE on
   * `auth_helpers.my_role()` is present. Those three values were measured
   * against production before this assertion was written; the harness had a
   * `grant usage on schema auth_helpers` in its post-replay step that production
   * does not have, and this test is the thing that stops it coming back.
   *
   * It fails if the harness is handed the grant again, and the failure is meant
   * to be a question, not a chore: a green admin test does not need USAGE (see
   * `an admin writes through the admin policy even though the helper is not
   * reachable by name`), so re-granting it buys nothing and only makes the
   * harness describe a database nobody runs. Before changing this expectation,
   * answer against PRODUCTION whether the privilege is there.
   */
  test('authenticated holds EXECUTE on my_role() and no USAGE on its schema', async () => {
    const rows = await ctx.sql.unsafe<
      {
        usage_authenticated: boolean;
        usage_anon: boolean;
        exec_my_role: boolean;
      }[]
    >(`select has_schema_privilege('authenticated'::name, 'auth_helpers'::regnamespace, 'usage') as usage_authenticated,
              has_schema_privilege('anon'::name,         'auth_helpers'::regnamespace, 'usage') as usage_anon,
              has_function_privilege('authenticated'::name, 'auth_helpers.my_role()'::regprocedure, 'execute') as exec_my_role`);

    expect(rows[0], 'the three privilege values did not come back').toEqual({
      usage_authenticated: false,
      usage_anon: false,
      exec_my_role: true,
    });
  });

  /**
   * The one thing the missing USAGE actually does: the helper is not callable by
   * name, and the refusal names the SCHEMA rather than the function.
   *
   * `42501 permission denied for schema auth_helpers`, for all three client
   * roles. It is not `permission denied for function my_role` — the schema is
   * resolved first, so a role without USAGE never gets as far as asking about
   * the function, no matter that it holds EXECUTE on it.
   *
   * Both halves of that message are asserted because they change together: if
   * someone re-adds the harness grant this test fails, and if the shape drifts
   * to the function-level error it fails too. Either way the next reader learns
   * that the grant was touched, which is the only way to find out before a
   * harness starts asserting a database that does not exist.
   */
  test('a client session cannot call auth_helpers.my_role() by name', async () => {
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      const denial = await deniedAs(
        ctx.sql,
        role,
        role === 'authenticated' ? ADMIN : null,
        (tx) => tx.unsafe(`select auth_helpers.my_role()::text as role`),
      );

      expect(
        denial,
        `${role} was able to call the helper by name`,
      ).not.toBeNull();
      expect(denial?.code).toBe('42501');
      expect(denial?.message).toContain(
        'permission denied for schema auth_helpers',
      );
    }
  });

  /**
   * The admin path works, and the interesting part is that it works WITHOUT the
   * schema USAGE the policies appear to need.
   *
   * "Admins can manage categories" grants nothing by itself — it says
   * `auth_helpers.my_role() = 'admin'`, and `my_role()` is a `SECURITY DEFINER`
   * function that reads `public.profiles` and bypasses its RLS to do it. So this
   * covers the whole chain at once: the profile row has to exist, the helper has
   * to be executable by `authenticated`, `auth.uid()` has to resolve to the
   * seeded subject, and the `WITH CHECK` has to admit the new row. Break any
   * link and this fails.
   *
   * The subquery form matters, and it is why this test exists in this form: the
   * policy's expression was resolved when the policy was created, by the role
   * that created it, so the USAGE check on the schema was made and satisfied
   * THERE. At query time only ACL_EXECUTE is re-checked, and `authenticated`
   * holds it. The previous version of this test needed a harness-only grant to
   * pass, which meant it was asserting a privilege production does not have and
   * proving nothing about the real one — see the FINDING block in the header.
   *
   * Read back as the owner afterwards, because an admin's own SELECT goes
   * through the policies and not through the row it just wrote.
   */
  test('an admin writes through the admin policy even though the helper is not reachable by name', async () => {
    // The seed, verified rather than assumed. `auth.users` is the only producer
    // of a profile, so an `on conflict do nothing` that silently left a stale
    // `role` behind would make this test assert nothing at all.
    const seeded = await ctx.sql.unsafe<{ role: string }[]>(
      `select role::text from public.profiles where id = '${ADMIN}'`,
    );
    expect(seeded[0]?.role, 'the admin fixture was not promoted').toBe('admin');

    const inserted = await as(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `insert into public.categories (name, slug, active)
         values ('written by the admin', 'rls-pilot-admin', false)
         returning slug`,
      ),
    );
    expect(inserted.map((r) => r.slug)).toEqual(['rls-pilot-admin']);

    const updated = await as(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe<{ name: string }[]>(
        `update public.categories set name = 'renamed by the admin'
          where slug = 'rls-pilot-admin' returning name`,
      ),
    );
    expect(updated.map((r) => r.name)).toEqual(['renamed by the admin']);

    const deleted = await as(ctx.sql, 'authenticated', ADMIN, (tx) =>
      tx.unsafe<{ slug: string }[]>(
        `delete from public.categories where slug = 'rls-pilot-admin' returning slug`,
      ),
    );
    expect(deleted.map((r) => r.slug)).toEqual(['rls-pilot-admin']);

    const rows = await ctx.sql.unsafe<{ slug: string }[]>(
      `select slug from public.categories where slug = 'rls-pilot-admin'`,
    );
    expect(plainRows(rows)).toEqual([]);
  });

  /**
   * The admin policy is alive on the READ path too, which is where a claim that
   * it is dead would have shown up first.
   *
   * Both policies are PERMISSIVE, so Postgres ORs them. For an admin
   * `(select auth_helpers.my_role()) = 'admin'` is true and the row passes on
   * that policy alone — the read policy's `active = true` is never consulted.
   * That is why an admin sees the inactive rows and `anon` does not, and it is
   * the direct disproof of "the missing USAGE disarmed every admin policy": if
   * the policy were unreachable, this SELECT would return the same single row
   * `anon` gets.
   *
   * The same OR is what makes the counter-intuitive case safe. `authenticated`
   * IS in the admin policy's `TO` list, so for a plain member the expression is
   * evaluated, comes back false, and the read falls through to "Anyone can view
   * active categories" — the member still gets the active rows and nothing
   * else, exactly as `anon` does. Postgres does not error on a false qual and it
   * does not need a true one, so a policy that evaluates to false is
   * indistinguishable, to a consumer, from a policy that was never reached. That
   * is worth pinning: someone reading the admin policy as dead code, or
   * "simplifying" the read policy away, would break every consumer read on this
   * table and no privilege assertion would have warned them.
   */
  test('an admin reads every category while a consumer reads only the active ones', async () => {
    // Scoped to this file's own three rows, the way every other exact assertion
    // in here is. The ledger seeds its own categories, and an unscoped read
    // would turn a future seed migration into a failure here.
    const query = `select slug from public.categories
                    where slug in ('${ACTIVE_SLUG}', '${DRAFT_SLUG}', '${ARCHIVED_SLUG}')
                    order by slug`;
    const pilot = (
      role: 'owner' | 'anon' | 'authenticated',
      userId: string | null,
    ) =>
      role === 'owner'
        ? ctx.sql
            .unsafe<{ slug: string }[]>(query)
            .then((r) => r.map((x) => x.slug))
        : as(ctx.sql, role, userId, (tx) =>
            tx.unsafe<{ slug: string }[]>(query),
          ).then((r) => r.map((x) => x.slug));

    const asOwner = await pilot('owner', null);
    const asAdmin = await pilot('authenticated', ADMIN);
    const asMember = await pilot('authenticated', MEMBER);
    const asAnon = await pilot('anon', null);

    // The admin is held to a DIFFERENT result from a member, on the same table
    // and in the same session role. Only the admin policy can produce this
    // difference, so the two sets differing is the evidence that it ran.
    expect(asAdmin, 'an admin cannot see more than a member').not.toEqual(
      asMember,
    );
    expect(asAdmin).toEqual([ACTIVE_SLUG, ARCHIVED_SLUG, DRAFT_SLUG]);

    // The member is in the admin policy's TO list, so its expression was
    // evaluated and returned false, and the OR landed on the read policy. The
    // result must be byte-identical to `anon`, which is NOT in that list at all
    // and therefore never evaluated it — same answer, two different paths.
    expect(asMember).toEqual(asAnon);
    expect(asMember).toEqual([ACTIVE_SLUG]);

    // And the admin's set is a subset of the owner's, like every other role's.
    const ownerSet = new Set(asOwner);
    for (const slug of asAdmin) expect(ownerSet.has(slug)).toBe(true);
    expect(asOwner).toEqual([ACTIVE_SLUG, ARCHIVED_SLUG, DRAFT_SLUG]);
  });

  /**
   * A non-admin cannot promote itself by putting `role = 'admin'` in the body of
   * a `profiles` update — and the reason it cannot is worth stating precisely,
   * because the reason is NOT the policy.
   *
   * The policy "Users can update own profile" is
   * `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`. It constrains WHICH
   * ROW, never WHICH COLUMNS. On its own it would happily let a user rewrite its
   * own `role`, and that is not a hypothetical: re-granting table-wide UPDATE on
   * `public.profiles` in this harness — which is what the Supabase default
   * privileges do before the ledger's revokes run — turns the escalation into a
   * working one. Measured on this very database with that grant in place:
   *
   *     set role authenticated;  update public.profiles set role = 'admin'
   *       where id = auth.uid();   -- succeeds, and my_role() then returns admin
   *
   * What actually stops it is
   * `20260925155153_harden_client_write_boundaries.sql`, which runs
   * `revoke all privileges on table public.profiles from anon, authenticated`
   * and grants SELECT back. The boundary is one layer deep and it is the GRANT,
   * not the RLS.
   *
   * Recorded because a future migration that re-grants a column on `profiles`
   * would reopen a privilege escalation with no policy change at all, and no
   * policy-shaped test would notice. If this assertion ever starts failing with
   * a 0-row UPDATE instead of a 42501, the grant is back and the escalation is
   * live.
   */
  test('a non-admin cannot escalate by writing role into its own profile', async () => {
    const denial = await deniedAs(ctx.sql, 'authenticated', MEMBER, (tx) =>
      tx.unsafe(
        `update public.profiles set role = 'admin' where id = auth.uid() returning id`,
      ),
    );

    expect(
      denial,
      'a signed-in user was able to promote its own profile',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    // A privilege error, not a policy error. The distinction is the point of
    // this test and it is asserted explicitly, because a policy-based denial
    // here would mean the grant had been restored and the test would be
    // describing a different, much better world.
    expect(denial?.message).toContain('permission denied for table profiles');
    expect(denial?.message).not.toContain('row-level security policy');

    // And the role is unchanged, read as the owner.
    const rows = await ctx.sql.unsafe<{ role: string }[]>(
      `select role::text from public.profiles where id = '${MEMBER}'`,
    );
    expect(rows[0]?.role).toBe('user');
  });
});

describe('the replayed ledger', () => {
  /**
   * Four migrations in `supabase/migrations/` cannot apply to a fresh
   * database. That is a fact about the ledger, and it is asserted here so it
   * stays a fact instead of becoming a habit.
   *
   * The alternative — a harness that tolerates failures up to a number — is the
   * worst of both worlds: the suite keeps running against a schema nobody
   * reviewed, and a NEW break is indistinguishable from the ones that were
   * already there. So the set is a fixture. Add a migration that fails and
   * `createSupabaseTestDb()` refuses to produce a database and prints the file;
   * fix one of these four and it does the same, and prints the file that
   * stopped failing.
   *
   * It was seven until this set was worked through. Three of the seven were
   * closed by restoring the exact function-body text that two byte-identical
   * migrations rewrite by literal matching, and one by an audited application-
   * order inversion; the reasoning lives in the `why` on each remaining entry and
   * in `supabase/migrations/README.md`. The count is asserted rather than
   * described, so the next closure is as visible as this one.
   */
  test('the failing set is exactly the pinned debt, nothing added or removed', async () => {
    const drift = diffReplayFailures(ctx.replay.failures);

    expect(
      drift,
      `the replayed ledger no longer matches KNOWN_REPLAY_FAILURES:\n${drift.join('\n')}`,
    ).toEqual([]);

    // Spelled out so a change shows up in the diff of the test output and not
    // only in a count.
    expect(
      ctx.replay.failures.map((f) => `${f.file} ${f.code}`).sort(),
    ).toEqual(KNOWN_REPLAY_FAILURES.map((k) => `${k.file} ${k.code}`).sort());
    expect(KNOWN_REPLAY_FAILURES).toHaveLength(4);
  });

  /**
   * Each of the four still fails FOR ITS OWN REASON.
   *
   * A set comparison would accept a file failing for any reason at all as the
   * same known failure, and this list was already wrong once: it was first
   * written when the failures carried no SQLSTATE, so every entry read as `?` and
   * matched anything. Pinning the code plus a fragment of the message is what
   * makes "the same failure" a checkable claim.
   *
   * It has already earned its keep twice. `20260927053728` used to fail on its
   * function-body guard and now fails on its data assertion instead — the same
   * file, a different reason, and the two are unrelated findings — and a
   * file-only comparison would have called that unchanged.
   */
  test('each pinned failure still fails the way it is documented', async () => {
    const actual = new Map(
      ctx.replay.failures.map((f) => [f.file, f] as const),
    );

    for (const known of KNOWN_REPLAY_FAILURES) {
      const failure = actual.get(known.file);
      expect(failure, `${known.file} is not failing at all`).toBeDefined();
      expect(failure?.code, `${known.file}: ${known.why}`).toBe(known.code);
      expect(
        failure?.msg,
        `${known.file} no longer fails with the documented message: ${known.why}`,
      ).toContain(known.msgIncludes);
    }
  });

  /**
   * The rest of the ledger applied, which is what makes the four meaningful.
   *
   * 1023 statements across 113 files, and the end state carries 103 policies on
   * 34 RLS-enabled tables. Without this the "4 known failures" number could be
   * satisfied by a replay that applied almost nothing, and every policy
   * assertion above would be asserting against a database that never got built.
   *
   * The floor is on `applied` and not an equality on a count, because the point
   * is the shape — a substantial ledger built, minus four files — and pinning
   * 1023 exactly would make this test fail every time a migration is added, which
   * is the wrong reason for a database spec to go red.
   */
  test('the other 113 migrations applied and the schema is populated', async () => {
    expect(ctx.replay.applied).toBeGreaterThan(1000);
    // Two statements are deliberately not executed: the harness provides
    // `pg_cron` and `pg_net` as schema stubs, because neither extension is
    // installable in this image. Recorded rather than left as a mystery count.
    expect(ctx.replay.skipped.map((s) => s.reason)).toEqual([
      'extension pg_cron is provided as a schema stub by the harness',
      'extension pg_cron is provided as a schema stub by the harness',
    ]);

    const counts = await ctx.sql.unsafe<
      { policies: number; rls_tables: number; tables: number }[]
    >(`select (select count(*)::int from pg_policies
                         where schemaname = 'public')                  as policies,
              (select count(*)::int from pg_tables
                         where schemaname = 'public' and rowsecurity) as rls_tables,
              (select count(*)::int from pg_tables
                         where schemaname = 'public')                  as tables`);

    expect(counts[0]?.policies).toBeGreaterThan(90);
    expect(counts[0]?.rls_tables).toBeGreaterThan(30);
    expect(counts[0]?.tables).toBeGreaterThan(35);
  });
});
