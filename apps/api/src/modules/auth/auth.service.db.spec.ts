import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import { UserDefaultsService } from '../users/user-defaults.service';
import { AuthService } from './auth.service';

let ctx: TestDbContext;

const CONFIG = {
  get: (key: string) =>
    ({
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })[key],
} as never;

/** A service whose GoTrue client is stubbed; only the profile read is real. */
function buildService(seeder: UserDefaultsService): AuthService {
  return new AuthService(CONFIG, ctx.db, seeder);
}

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

/** Stubs a successful password sign-in for `user`. */
function stubSignIn(service: AuthService, user: Record<string, unknown>): void {
  (service as unknown as { supabaseAnon: unknown }).supabaseAnon = {
    auth: {
      signInWithPassword: async () => ({
        data: { user, session },
        error: null,
      }),
    },
  };
}

async function rowCounts(db: TestDatabase, userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId));
  const [preferences] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId));
  const [consumerPreferences] = await db
    .select()
    .from(consumerNotificationPreferences)
    .where(eq(consumerNotificationPreferences.user_id, userId));
  const consents = await db
    .select()
    .from(userConsents)
    .where(eq(userConsents.user_id, userId));
  return {
    profile: profile ? 1 : 0,
    preferences: preferences ? 1 : 0,
    consumerPreferences: consumerPreferences ? 1 : 0,
    consents: consents.length,
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.stop();
});

/**
 * The failure window phase 1.5 opens: seeding is a separate step from the
 * `auth.users` INSERT, so an auth user can exist with no profile — and
 * AuthGuard answers 401 to every protected route for an account with no
 * profile. Login repairs it instead of the registration deleting the account.
 */
describe('AuthService.login repairs a missing profile (DB real)', () => {
  test('provisions the default rows and returns the repaired profile', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    stubSignIn(service, {
      id,
      email: `${id}@repair.cl`,
      phone: '+593911111111',
      user_metadata: { full_name: 'Repair Me', role: 'business' },
    });

    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 0,
      preferences: 0,
      consumerPreferences: 0,
      consents: 0,
    });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.user).toEqual({
      id,
      email: `${id}@repair.cl`,
      full_name: 'Repair Me',
      avatar_url: null,
      // The repair honours the allowlisted role from metadata, exactly like
      // the trigger did: an 'admin' would land as 'user'.
      role: 'business',
    });
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 1,
      consumerPreferences: 1,
      consents: 3,
    });
  });

  test('never lets metadata promote an account to admin', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    stubSignIn(service, {
      id,
      email: `${id}@repair.cl`,
      user_metadata: { full_name: 'Root', role: 'admin' },
    });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.user.role).toBe('user');
  });

  test('an account that already has a profile is left alone', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    await ctx.db.insert(profiles).values({
      id,
      email: `${id}@existing.cl`,
      full_name: 'Already Here',
      role: 'admin',
    });

    stubSignIn(service, {
      id,
      email: `${id}@existing.cl`,
      // Signup metadata must not rewrite a platform-controlled role.
      user_metadata: { full_name: 'Overwritten', role: 'user' },
    });

    const result = await service.login({
      email: `${id}@existing.cl`,
      password: 'password123',
    });

    expect(result.user).toEqual({
      id,
      email: `${id}@existing.cl`,
      full_name: 'Already Here',
      avatar_url: null,
      role: 'admin',
    });
    // No preferences/consents invented for an account the trigger already
    // provisioned: the repair only runs when the profile is missing.
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 0,
      consumerPreferences: 0,
      consents: 0,
    });
  });

  test('a failed repair still returns the session', async () => {
    // The repair must not turn a database hiccup into a 500: the caller holds a
    // valid session and the next sign-in tries again.
    const failing = {
      seed: async () => {
        throw new Error('database is down');
      },
    } as unknown as UserDefaultsService;
    const service = buildService(failing);
    const id = randomUUID();
    stubSignIn(service, { id, email: `${id}@repair.cl` });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.access_token).toBe('access-token');
    expect(result.user).toEqual({
      id,
      email: `${id}@repair.cl`,
      full_name: null,
      avatar_url: null,
      role: 'user',
    });
  });
});
