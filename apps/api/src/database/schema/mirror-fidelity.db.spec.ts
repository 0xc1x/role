import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';

/**
 * The test database must have the same REFERENTIAL ACTIONS as production.
 *
 * This exists because it did not, twice, and both times the suite was green.
 * `apps/api/drizzle/` is where the harness builds its schema from, and those
 * folders carried 39 foreign keys of the database's 81, seventeen of them with
 * no `ON DELETE` clause at all — which Postgres reads as NO ACTION. So a spec
 * deleting a profile got `23503` where Supabase silently cascaded, and
 * `DELETE /api/v1/auth/account` proved the negative: that its erase path is
 * never taken, because on this database that path cannot be taken. The
 * business owner's customers' orders it would have destroyed in production were
 * invisible to every test.
 *
 * The expectations below were read from Supabase with `drizzle-kit pull`, not
 * from this repository, so regenerating the mirror cannot quietly redefine what
 * "correct" means. Re-read them from the live database when the schema changes;
 * copying them from `drizzle/` would make this test agree with whatever drift
 * it is meant to catch.
 *
 * Composite constraints are excluded: `offers_location_business_fkey` spans two
 * columns and is declared separately by the mirror. Foreign keys into
 * `auth.users` and `storage` are excluded because the harness cannot create
 * those schemas.
 */
const EXPECTED: ReadonlyArray<readonly [string, string, string]> = [
  ['business_finance', 'business_id', 'CASCADE'],
  ['business_hours', 'business_id', 'CASCADE'],
  ['business_locations', 'business_id', 'CASCADE'],
  ['business_moderation', 'business_id', 'CASCADE'],
  ['business_moderation', 'verified_by', 'NO ACTION'],
  ['business_notification_preferences', 'business_id', 'NO ACTION'],
  ['business_ownership', 'business_id', 'CASCADE'],
  ['business_ownership', 'owner_id', 'CASCADE'],
  ['consumer_notification_preferences', 'user_id', 'NO ACTION'],
  ['coupons', 'business_id', 'CASCADE'],
  ['device_tokens', 'user_id', 'CASCADE'],
  ['email_sends', 'template_id', 'SET NULL'],
  ['email_templates', 'footer_id', 'SET NULL'],
  ['email_templates', 'header_id', 'SET NULL'],
  ['favorites', 'offer_id', 'CASCADE'],
  ['favorites', 'user_id', 'CASCADE'],
  // KNOWN MODELLING DIVERGENCE, asserted rather than hidden.
  //
  // Supabase points both of these at `auth.users`; the Drizzle mirror points
  // them at `profiles`. The mirror cannot express `auth.users` without a stub
  // table for a schema the harness does not create, so `profiles` is the closest
  // thing it CAN say, and it is what CI generates.
  //
  // The difference is observable, not cosmetic. Under `profiles` a cascade
  // follows a profile delete; under `auth.users` it follows an auth-user delete.
  // Nothing in the account-deletion path depends on it — `anonymise` updates
  // `marketing_preferences` rather than deleting it — but it is a real
  // difference and it is recorded in both directions: here, and as a
  // `drizzle-kit pull` difference if the mirror is ever regenerated from the
  // live database.
  ['marketing_preferences', 'user_id', 'CASCADE'],
  ['offer_categories', 'category_id', 'CASCADE'],
  ['offer_categories', 'offer_id', 'CASCADE'],
  ['offers', 'business_id', 'CASCADE'],
  ['offers', 'business_location_id', 'NO ACTION'],
  ['order_events', 'changed_by', 'SET NULL'],
  ['order_events', 'order_id', 'CASCADE'],
  ['orders', 'business_id', 'CASCADE'],
  ['orders', 'coupon_id', 'SET NULL'],
  ['orders', 'offer_id', 'CASCADE'],
  ['orders', 'user_id', 'CASCADE'],
  ['payouts', 'business_id', 'CASCADE'],
  // KNOWN MODELLING DIVERGENCE, same class as `marketing_preferences` above and
  // for the same reason. Supabase holds
  // `payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
  // ON DELETE CASCADE`; the Drizzle mirror points at `profiles`, the closest
  // thing it can name without a stub for a schema the harness does not create.
  //
  // Listed rather than hidden because this spec asserts BOTH directions: an
  // unlisted foreign key in the test database is itself reported as drift, so
  // adding the table to the mirror without adding it here would fail the suite
  // for a reason that has nothing to do with the change. The observable
  // difference is that the cascade follows a profile delete here and an
  // auth-user delete in production — and nothing in this module's delete path
  // depends on it, because removal is always a soft delete.
  ['payment_methods', 'user_id', 'CASCADE'],
  ['push_notifications', 'template_id', 'NO ACTION'],
  ['push_sends', 'campaign_id', 'CASCADE'],
  ['push_sends', 'user_id', 'NO ACTION'],
  ['reviews', 'business_id', 'CASCADE'],
  ['reviews', 'moderated_by', 'SET NULL'],
  ['reviews', 'order_id', 'SET NULL'],
  ['reviews', 'user_id', 'CASCADE'],
  ['saved_addresses', 'user_id', 'CASCADE'],
  ['segment_users', 'segment_id', 'CASCADE'],
  ['segment_users', 'user_id', 'CASCADE'],
  ['user_consents', 'user_id', 'CASCADE'],
  ['user_preferences', 'user_id', 'CASCADE'],
  // La baja de un aviso se lleva sus acks: `announcement_acknowledgements`
  // declara `on delete cascade` sobre el aviso, igual que en Supabase. Sin
  // esto el aviso podría desaparecer dejando acknowledgements de una fila que ya
  // no existe.
  ['announcement_acknowledgements', 'announcement_id', 'CASCADE'],
  // Misma divergencia declarada que `marketing_preferences` y
  // `payment_methods`, y por el mismo motivo: Supabase apunta a `auth.users`, y el
  // espejo puede nombrar lo más parecido sin inventar un schema que el harness no
  // crea. Observable —la cascada sigue a un borrado de perfil acá y a uno de
  // usuario de auth en producción— y sin consecuencia en este módulo, que
  // nunca borra en hard: la baja de una cuenta anonimiza.
  ['announcement_acknowledgements', 'user_id', 'CASCADE'],
  // `payment_intents.order_id` and `payment_events.payment_intent_id` exist in
  // Supabase and are deliberately NOT listed: the API declares no pgTable for
  // either table, so the harness never creates them and there is nothing to
  // constrain. Listing them would make this test demand a table the mirror does
  // not have, and the failure would be about the wrong thing.
];

/** `pg_constraint.confdeltype`: a = no action, c = cascade, n = set null, r = restrict. */
const CONFDELETTYPE: Record<string, string> = {
  a: 'NO ACTION',
  c: 'CASCADE',
  n: 'SET NULL',
  r: 'RESTRICT',
  d: 'SET DEFAULT',
};

describe('the test database matches production referential actions', () => {
  let ctx: TestDbContext;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  test('every single-column foreign key carries the production ON DELETE', async () => {
    // postgres-js returns a RowList, which is iterable but has no `.rows`
    // property once it has come back through Drizzle.
    const result = await ctx.db.execute(sql`
      select
        k.conrelid::regclass::text  as table_name,
        a.attname                   as column_name,
        k.confdeltype               as confdeltype
      from pg_constraint k
      join pg_class c      on c.oid = k.conrelid
      join pg_namespace n  on n.oid = c.relnamespace
      join unnest(k.conkey) with ordinality key(attnum, ord) on true
      join pg_attribute a  on a.attrelid = k.conrelid and a.attnum = key.attnum
      where n.nspname = 'public'
        and k.contype = 'f'
        and array_length(k.conkey, 1) = 1
      order by 1, 2
    `);

    const actual = new Map<string, string>();
    for (const row of result as unknown as Iterable<{
      table_name: string;
      column_name: string;
      confdeltype: string;
    }>) {
      const action = CONFDELETTYPE[row.confdeltype] ?? row.confdeltype;
      actual.set(`${row.table_name}.${row.column_name}`, action);
    }

    const wrong: string[] = [];
    for (const [table, column, expected] of EXPECTED) {
      const key = `${table}.${column}`;
      const got = actual.get(key);
      if (got === undefined) {
        wrong.push(
          `${key}: absent from the test database, expected ${expected}`,
        );
      } else if (got !== expected) {
        wrong.push(`${key}: ${got}, expected ${expected}`);
      }
    }

    // A foreign key the expectations do not know about is drift too, in the
    // other direction: it is a constraint the mirror grew without anybody
    // deciding what it should do on delete.
    for (const [key, action] of actual) {
      if (!EXPECTED.some(([t, c]) => `${t}.${c}` === key)) {
        wrong.push(`${key}: ${action} is not in the expected set`);
      }
    }

    expect(wrong).toEqual([]);
  });
});
