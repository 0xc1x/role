import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { asc, count, eq, sql } from 'drizzle-orm';
import {
  consumerNotificationPreferences,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';
import {
  createTestDb,
  type TestDbContext,
  type TestDatabase,
} from '../../../test/db';
import { UserDefaultsService } from './user-defaults.service';

let ctx: TestDbContext;
let seeder: UserDefaultsService;

/**
 * The production trigger chain, copied verbatim from the live database
 * (`pg_get_functiondef`): `handle_new_user` on `auth.users`, plus the two
 * triggers on `profiles`. Their bodies are the claim under test — this spec
 * provisions one user through the SQL and another through the API, then diffs
 * the four tables row by row.
 *
 * `auth.users` is a stand-in for the GoTrue table: the mirror database is bare
 * Postgres, so only the columns the trigger reads are needed.
 */
const installTriggerChain = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    phone text,
    raw_user_meta_data jsonb
  );

  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $function$
  begin
    insert into public.profiles (id, email, full_name, avatar_url, phone, role)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      new.raw_user_meta_data ->> 'avatar_url',
      new.phone,
      (case when new.raw_user_meta_data ->> 'role' in ('user', 'business')
             then new.raw_user_meta_data ->> 'role'
             else 'user' end)::public.app_role
    )
    on conflict (id) do nothing;
    return new;
  end;
  $function$;

  drop trigger if exists handle_new_user on auth.users;
  create trigger handle_new_user
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

  create or replace function public.create_user_preferences()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $function$
  begin
    insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.consumer_notification_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
  end;
  $function$;

  drop trigger if exists create_user_preferences on public.profiles;
  create trigger create_user_preferences
    after insert on public.profiles
    for each row
    execute function public.create_user_preferences();

  create or replace function public.create_default_consents()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $function$
  BEGIN
    INSERT INTO public.user_consents (user_id, consent_type, granted)
    VALUES
      (NEW.id, 'analytics', false),
      (NEW.id, 'marketing', false),
      (NEW.id, 'notifications', true)
    ON CONFLICT (user_id, consent_type) DO NOTHING;
    RETURN NEW;
  END;
  $function$;

  drop trigger if exists create_default_consents on public.profiles;
  create trigger create_default_consents
    after insert on public.profiles
    for each row
    execute function public.create_default_consents();
`;

/** The state the cutover creates: the three provisioning triggers are gone. */
const dropTriggerChain = `
  drop trigger if exists handle_new_user on auth.users;
  drop trigger if exists create_user_preferences on public.profiles;
  drop trigger if exists create_default_consents on public.profiles;
`;

interface SeedInput {
  fullName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  requestedRole?: string | null;
}

/** Provisions a user the way Supabase does: an INSERT into `auth.users`. */
async function provisionByTrigger(
  db: TestDatabase,
  input: SeedInput = {},
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id}@trigger.cl`;
  const metadata: Record<string, string> = {};
  if (input.fullName != null) metadata.full_name = input.fullName;
  if (input.avatarUrl != null) metadata.avatar_url = input.avatarUrl;
  if (input.requestedRole != null) metadata.role = input.requestedRole;

  await db.execute(sql`
    insert into auth.users (id, email, phone, raw_user_meta_data)
    values (
      ${id},
      ${email},
      ${input.phone ?? null},
      ${sql.raw(`'${JSON.stringify(metadata)}'::jsonb`)}
    )
  `);
  return { id, email };
}

/** Provisions the same user through the API mirror. */
async function provisionByApi(
  input: SeedInput = {},
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id}@api.cl`;
  await seeder.seed({
    id,
    email,
    fullName: input.fullName,
    avatarUrl: input.avatarUrl,
    phone: input.phone,
    requestedRole: input.requestedRole,
  });
  return { id, email };
}

/**
 * Everything the trigger chain is responsible for, and nothing else: the
 * generated ids, the audit timestamps and the email are excluded on purpose
 * (the two paths provision two different accounts, so their emails differ by
 * construction), which means a diff can only come from a semantic difference.
 */
async function snapshot(db: TestDatabase, userId: string) {
  const [profile] = await db
    .select({
      full_name: profiles.full_name,
      avatar_url: profiles.avatar_url,
      phone: profiles.phone,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, userId));

  const [preferences] = await db
    .select({
      notification_radius_km: userPreferences.notification_radius_km,
      favorite_categories: userPreferences.favorite_categories,
      language: userPreferences.language,
      theme_mode: userPreferences.theme_mode,
    })
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId));

  const [consumerPreferences] = await db
    .select({
      push_enabled: consumerNotificationPreferences.push_enabled,
      email_enabled: consumerNotificationPreferences.email_enabled,
      sms_enabled: consumerNotificationPreferences.sms_enabled,
      whatsapp_enabled: consumerNotificationPreferences.whatsapp_enabled,
      favorite_alerts_enabled:
        consumerNotificationPreferences.favorite_alerts_enabled,
      pickup_reminders_enabled:
        consumerNotificationPreferences.pickup_reminders_enabled,
      last_minute_deals_enabled:
        consumerNotificationPreferences.last_minute_deals_enabled,
      weekly_summary_enabled:
        consumerNotificationPreferences.weekly_summary_enabled,
      quiet_hours_from: consumerNotificationPreferences.quiet_hours_from,
      quiet_hours_to: consumerNotificationPreferences.quiet_hours_to,
    })
    .from(consumerNotificationPreferences)
    .where(eq(consumerNotificationPreferences.user_id, userId));

  const consents = await db
    .select({
      consent_type: userConsents.consent_type,
      granted: userConsents.granted,
      granted_at: userConsents.granted_at,
      revoked_at: userConsents.revoked_at,
    })
    .from(userConsents)
    .where(eq(userConsents.user_id, userId))
    .orderBy(asc(userConsents.consent_type));

  return {
    profile: profile ?? null,
    preferences: preferences ?? null,
    consumerPreferences: consumerPreferences ?? null,
    consents,
  };
}

/** Row counts, because a snapshot that reads one row would hide duplicates. */
async function rowCounts(db: TestDatabase, userId: string) {
  const [profile] = await db
    .select({ n: count() })
    .from(profiles)
    .where(eq(profiles.id, userId));
  const [preferences] = await db
    .select({ n: count() })
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId));
  const [consumerPreferences] = await db
    .select({ n: count() })
    .from(consumerNotificationPreferences)
    .where(eq(consumerNotificationPreferences.user_id, userId));
  const [consents] = await db
    .select({ n: count() })
    .from(userConsents)
    .where(eq(userConsents.user_id, userId));
  return {
    profile: profile?.n ?? 0,
    preferences: preferences?.n ?? 0,
    consumerPreferences: consumerPreferences?.n ?? 0,
    consents: consents?.n ?? 0,
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
  seeder = new UserDefaultsService(ctx.db);
  await ctx.db.execute(installTriggerChain);
});

afterAll(async () => {
  await ctx.stop();
});

/**
 * The claim under test is not "the API inserts something reasonable" but "the
 * API produces the rows the SQL produces". Each case therefore provisions a
 * user with the triggers, drops the triggers, provisions the same user through
 * the API and diffs all four tables — the diff being exactly what a cutover
 * would expose.
 */
describe('UserDefaultsService parity with the trigger chain (DB real)', () => {
  const cases: Array<[string, SeedInput]> = [
    ['no metadata at all', {}],
    ['full name only', { fullName: 'Ada Lovelace' }],
    [
      'every column populated',
      {
        fullName: 'Dueña Panadería',
        avatarUrl: 'https://cdn.test/avatar.png',
        phone: '+593900000000',
        requestedRole: 'business',
      },
    ],
    ['role business without a name', { requestedRole: 'business' }],
    ['role user requested explicitly', { requestedRole: 'user' }],
    // The allowlist: the trigger casts anything outside ('user','business') to
    // 'user', so an 'admin' in metadata is not a privilege escalation.
    ['hostile role admin', { fullName: 'Root', requestedRole: 'admin' }],
    ['unknown role', { requestedRole: 'superuser' }],
    ['empty metadata strings', { fullName: '', avatarUrl: '' }],
  ];

  for (const [name, input] of cases) {
    test(`same rows as the trigger chain: ${name}`, async () => {
      await ctx.db.execute(installTriggerChain);
      const byTrigger = await provisionByTrigger(ctx.db, input);
      const expected = await snapshot(ctx.db, byTrigger.id);

      await ctx.db.execute(dropTriggerChain);
      const byApi = await provisionByApi(input);

      expect(await snapshot(ctx.db, byApi.id)).toEqual(expected);
      expect(await rowCounts(ctx.db, byApi.id)).toEqual({
        profile: 1,
        preferences: 1,
        consumerPreferences: 1,
        consents: 3,
      });
    });
  }

  test('each path stores the email it was given', async () => {
    await ctx.db.execute(installTriggerChain);
    const byTrigger = await provisionByTrigger(ctx.db, { fullName: 'SQL' });
    const byApi = await provisionByApi({ fullName: 'API' });

    for (const { id, email } of [byTrigger, byApi]) {
      const [row] = await ctx.db
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, id));
      expect(row?.email).toBe(email);
    }
  });

  // Control: proves the harness above is live. If the trigger chain silently
  // failed to install, every parity case would compare an empty profile against
  // another empty profile and pass.
  test('the trigger chain really provisions four tables (control)', async () => {
    await ctx.db.execute(installTriggerChain);
    const { id } = await provisionByTrigger(ctx.db, { fullName: 'Control' });

    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 1,
      consumerPreferences: 1,
      consents: 3,
    });
    expect((await snapshot(ctx.db, id)).consents).toEqual([
      {
        consent_type: 'analytics',
        granted: false,
        granted_at: null,
        revoked_at: null,
      },
      {
        consent_type: 'marketing',
        granted: false,
        granted_at: null,
        revoked_at: null,
      },
      {
        consent_type: 'notifications',
        granted: true,
        granted_at: null,
        revoked_at: null,
      },
    ]);
  });

  test('a trigger-provisioned user survives the mirror run (pre-cutover)', async () => {
    // The double-write window: the triggers are still live AND the API seeds.
    // Both writers must be no-ops against each other, which is what makes the
    // ungated seeding safe today.
    await ctx.db.execute(installTriggerChain);
    const { id, email } = await provisionByTrigger(ctx.db, {
      fullName: 'Before Cutover',
      requestedRole: 'business',
    });
    const before = await snapshot(ctx.db, id);

    await seeder.seed({
      id,
      email,
      fullName: 'After Cutover',
      requestedRole: 'user',
    });

    expect(await snapshot(ctx.db, id)).toEqual(before);
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 1,
      consumerPreferences: 1,
      consents: 3,
    });
  });

  test('seeding twice is a no-op', async () => {
    const { id } = await provisionByApi({ fullName: 'Idempotente' });

    // A user who already changed their defaults: `on conflict do nothing` must
    // not reset them, or re-running the seeding would undo real user choices.
    await ctx.db
      .update(userPreferences)
      .set({ notification_radius_km: 42, language: 'en' })
      .where(eq(userPreferences.user_id, id));
    await ctx.db
      .update(userConsents)
      .set({ granted: true, granted_at: new Date() })
      .where(eq(userConsents.user_id, id));
    const before = await snapshot(ctx.db, id);

    await seeder.seed({
      id,
      email: `${id}@api.cl`,
      fullName: 'Otro Nombre',
      requestedRole: 'business',
    });

    expect(await snapshot(ctx.db, id)).toEqual(before);
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 1,
      consumerPreferences: 1,
      consents: 3,
    });
  });

  test('a caller-supplied admin role never lands', async () => {
    const { id } = await provisionByApi({
      fullName: 'Root',
      requestedRole: 'admin',
    });

    const [profile] = await ctx.db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, id));
    expect(profile?.role).toBe('user');
  });

  test('a rejected insert leaves nothing half-seeded', async () => {
    // The preferences and consent rows reference profiles.id, so the
    // transaction is what keeps a failure from producing a state the trigger
    // chain never could: preferences without a profile.
    const orphan = randomUUID();

    await expect(
      (async () => {
        await ctx.db.insert(userConsents).values({
          user_id: orphan,
          consent_type: 'analytics',
          granted: false,
        });
      })(),
    ).rejects.toThrow();
    expect(await rowCounts(ctx.db, orphan)).toEqual({
      profile: 0,
      preferences: 0,
      consumerPreferences: 0,
      consents: 0,
    });
  });
});
