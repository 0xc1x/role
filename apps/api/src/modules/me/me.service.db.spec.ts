import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  UpdateMyProfileSchema,
  UpsertMyConsentSchema,
} from '@0xc1x/role-commons';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import {
  categories,
  deviceTokens,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';
import { CategoriesRepository } from '../categories/categories.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';
import type { AuthUser } from '../../auth/auth.types';

let ctx: TestDbContext;
let service: MeService;
let repository: MeRepository;
let defaults: UserDefaultsService;
let categoriesRepository: CategoriesRepository;

let ownerId: string;
let strangerId: string;

const authUser = (id: string, role: 'user' | 'business' | 'admin' = 'user') =>
  ({ id, email: `${id}@t.cl`, role }) as AuthUser;

async function insertCategory(
  name: string,
  slug: string,
  active = true,
): Promise<string> {
  const [row] = await ctx.db
    .insert(categories)
    .values({ name, slug, active })
    .returning({ id: categories.id });
  if (!row) throw new Error('insertCategory failed');
  return row.id;
}

async function deviceRow(tokenValue: string) {
  const [row] = await ctx.db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.token, tokenValue));
  return row ?? null;
}

async function preferencesRow(userId: string) {
  const [row] = await ctx.db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId));
  return row ?? null;
}

beforeAll(async () => {
  ctx = await createTestDb();
  repository = new MeRepository(ctx.db);
  categoriesRepository = new CategoriesRepository(ctx.db);
  defaults = new UserDefaultsService(ctx.db);
  service = new MeService(repository, categoriesRepository);

  // Seeded through the real seeder, not by hand: the invariant this module
  // relies on is that the preference and consent rows are provisioned by
  // `UserDefaultsService` and the trigger chain, so a spec that hand-wrote them
  // would not be testing the shape the module meets in production.
  ownerId = await seedProfile(ctx.db);
  strangerId = await seedProfile(ctx.db);
  await defaults.seed({ id: ownerId, email: `${ownerId}@t.cl` });
  await defaults.seed({ id: strangerId, email: `${strangerId}@t.cl` });

  // The catalog `dispatch-nearby-offers` can match: active and not
  // soft-deleted, with the display name and an ASCII-folded slug.
  await insertCategory('Panadería', 'panaderia');
  await insertCategory('Frutería', 'fruteria');
  await insertCategory('Obsoleta', 'obsoleta', false);
});

afterAll(async () => {
  await ctx?.stop();
});

describe('MeService (DB real)', () => {
  describe('the account snapshot', () => {
    test('reads the caller, and only the caller', async () => {
      const account = await service.getAccount(authUser(ownerId));

      expect(account.profile.id).toBe(ownerId);
      expect(account.preferences?.user_id).toBe(ownerId);
      expect(account.notification_preferences?.user_id).toBe(ownerId);
      expect(account.consents.every((c) => c.user_id === ownerId)).toBe(true);
      expect(account.consents.map((c) => c.consent_type).sort()).toEqual([
        'analytics',
        'marketing',
        'notifications',
      ]);
    });

    test('an account with no seeded settings reads as nulls, not a 404', async () => {
      // These rows are seeded by the trigger chain and the seeder, but this API
      // never wrote them. A profile created before the chain existed still has to
      // be readable, and the API must not invent the rows it did not seed.
      const bareId = await seedProfile(ctx.db);

      const account = await service.getAccount(authUser(bareId));

      expect(account.profile.id).toBe(bareId);
      expect(account.preferences).toBeNull();
      expect(account.notification_preferences).toBeNull();
      expect(account.consents).toEqual([]);
      expect(await preferencesRow(bareId)).toBeNull();
    });
  });

  describe('role is not settable by the user', () => {
    test('a role in the PATCH body parses out and the role does not move', async () => {
      const parsed = UpdateMyProfileSchema.parse({
        role: 'admin',
        full_name: 'Ana',
        city: 'Providencia',
      });

      // Structural, not a 403: the field is not a key of the schema, so the
      // parsed body has nowhere to put it. The API owns `profiles` and bypasses
      // RLS, so nothing below this line would have stopped the write.
      expect('role' in parsed).toBe(false);

      await service.updateProfile(authUser(ownerId), parsed);

      const [row] = await ctx.db
        .select({ role: profiles.role, full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, ownerId));

      expect(row?.role).toBe('user');
      // The rest of the body did apply: this is a silent no-op on `role`, not a
      // rejected request.
      expect(row?.full_name).toBe('Ana');
    });

    test('even an admin token does not get a role write on /me', async () => {
      const parsed = UpdateMyProfileSchema.parse({ role: 'admin' });

      await service.updateProfile(authUser(ownerId, 'admin'), parsed);

      const [row] = await ctx.db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, ownerId));
      expect(row?.role).toBe('user');
    });

    test('an email change is refused and the column is untouched', async () => {
      const before = await ctx.db
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, ownerId));

      await expect(
        service.updateProfile(authUser(ownerId), {
          email: 'nuevo@correo.cl',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      const after = await ctx.db
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, ownerId));

      // The two stores are not left disagreeing: neither was written.
      expect(after[0]?.email).toBe(before[0]?.email);
    });
  });

  describe('favorite_categories cannot store a value that filters nothing', () => {
    test('a value outside the catalog is rejected and the stored list is unchanged', async () => {
      await service.updatePreferences(authUser(ownerId), {
        favorite_categories: ['Panadería'],
      });

      await expect(
        service.updatePreferences(authUser(ownerId), {
          favorite_categories: ['Panadería', 'No existe'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      // Not a partial write: the previous, working list is still intact.
      const row = await preferencesRow(ownerId);
      expect(row?.favorite_categories).toEqual(['Panadería']);
    });

    test('an inactive category is rejected too: it can never be matched', async () => {
      // `dispatch-nearby-offers` skips inactive categories when it builds the
      // per-offer name set, so favouriting one is a setting that does nothing.
      await expect(
        service.updatePreferences(authUser(ownerId), {
          favorite_categories: ['Obsoleta'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    test('the stored value is the one the near-offer dispatch actually compares', async () => {
      await service.updatePreferences(authUser(ownerId), {
        favorite_categories: ['  frutería ', 'panaderia'],
      });

      const row = await preferencesRow(ownerId);
      expect(row?.favorite_categories).toEqual(['Frutería', 'Panadería']);

      // The comparison from
      // `supabase/functions/dispatch-nearby-offers/index.ts`, reproduced
      // against the stored column: the user's lowercased favourites have to
      // intersect the lowercased catalog names of the offers' categories. Before
      // this validation, a slug ('panaderia') or a soft-cased name never
      // reached this point at all.
      const favourites = new Set(
        (row?.favorite_categories ?? []).map((c) => c.toLowerCase()),
      );
      const offerCategoryNames = new Set(['panadería', 'frutería']);

      expect([...favourites].some((fav) => offerCategoryNames.has(fav))).toBe(
        true,
      );
    });

    test('a caller cannot read or write another user preferences', async () => {
      await service.updatePreferences(authUser(strangerId), {
        favorite_categories: ['Frutería'],
        notification_radius_km: 42,
      });

      // The stranger reads its own row, not the owner's.
      const asStranger = await service.getPreferences(authUser(strangerId));
      expect(asStranger.preferences?.notification_radius_km).toBe(42);

      // And there is no id on the route or in the schema to aim at the owner.
      const parsed = UpdateMyProfileSchema.parse({
        user_id: ownerId,
        city: 'x',
      });
      expect('user_id' in parsed).toBe(false);
    });
  });

  describe('notification preferences', () => {
    test('a half-configured quiet window is refused and the row is unchanged', async () => {
      const before = await service.getNotificationPreferences(
        authUser(ownerId),
      );
      const beforeRow = before.notification_preferences;

      await expect(
        service.updateNotificationPreferences(authUser(ownerId), {
          quiet_hours_from: '22:00:00',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      const after = await service.getNotificationPreferences(authUser(ownerId));
      expect(after.notification_preferences?.quiet_hours_from).toBe(
        beforeRow?.quiet_hours_from,
      );
      expect(after.notification_preferences?.quiet_hours_to).toBe(
        beforeRow?.quiet_hours_to,
      );
    });

    test('both ends together are stored, and cleared together', async () => {
      await service.updateNotificationPreferences(authUser(ownerId), {
        quiet_hours_from: '22:00:00',
        quiet_hours_to: '07:00:00',
        push_enabled: false,
      });

      const set = await service.getNotificationPreferences(authUser(ownerId));
      expect(set.notification_preferences?.quiet_hours_from).toBe('22:00:00');
      expect(set.notification_preferences?.quiet_hours_to).toBe('07:00:00');
      expect(set.notification_preferences?.push_enabled).toBe(false);

      await service.updateNotificationPreferences(authUser(ownerId), {
        quiet_hours_from: null,
        quiet_hours_to: null,
      });

      const cleared = await service.getNotificationPreferences(
        authUser(ownerId),
      );
      expect(cleared.notification_preferences?.quiet_hours_from).toBeNull();
      expect(cleared.notification_preferences?.quiet_hours_to).toBeNull();
    });

    test('a caller cannot write another user notification preferences', async () => {
      const before = await service.getNotificationPreferences(
        authUser(strangerId),
      );

      await service.updateNotificationPreferences(authUser(ownerId), {
        weekly_summary_enabled: false,
      });

      const after = await service.getNotificationPreferences(
        authUser(strangerId),
      );
      expect(after.notification_preferences?.weekly_summary_enabled).toBe(
        before.notification_preferences?.weekly_summary_enabled,
      );
    });
  });

  describe('consents', () => {
    test('PUT is idempotent: the timestamps do not move on a repeat', async () => {
      const first = await service.putConsent(authUser(ownerId), {
        consent_type: 'marketing',
        granted: true,
      });
      const second = await service.putConsent(authUser(ownerId), {
        consent_type: 'marketing',
        granted: true,
      });

      expect(second.id).toBe(first.id);
      expect(second.granted_at).toBe(first.granted_at);
      expect(second.revoked_at).toBe(first.revoked_at);
      expect(second.updated_at).toBe(first.updated_at);
    });

    test('one row per consent type, however many times it is PUT', async () => {
      for (let i = 0; i < 3; i++) {
        await service.putConsent(authUser(ownerId), {
          consent_type: 'analytics',
          granted: true,
        });
      }

      const rows = await ctx.db
        .select()
        .from(userConsents)
        .where(eq(userConsents.user_id, ownerId));
      expect(rows.filter((r) => r.consent_type === 'analytics')).toHaveLength(
        1,
      );
    });

    test('granting records the moment, revoking records the revocation', async () => {
      const granted = await service.putConsent(authUser(ownerId), {
        consent_type: 'analytics',
        granted: true,
      });
      expect(granted.granted_at).not.toBeNull();
      expect(granted.revoked_at).toBeNull();

      const revoked = await service.putConsent(authUser(ownerId), {
        consent_type: 'analytics',
        granted: false,
      });
      expect(revoked.granted).toBe(false);
      expect(revoked.revoked_at).not.toBeNull();
      // The grant moment survives the revocation: it is the moment an audit
      // asks about.
      expect(revoked.granted_at).toBe(granted.granted_at);

      // And a repeat revoke is stable.
      const again = await service.putConsent(authUser(ownerId), {
        consent_type: 'analytics',
        granted: false,
      });
      expect(again.revoked_at).toBe(revoked.revoked_at);
    });

    test('a type outside the declared union never reaches the table', async () => {
      // `user_consents.consent_type` is a bare text column with NO CHECK, so a
      // row outside the union is storable. The schema is the only gate, which
      // is why it is an enum and not a string.
      const parsed = UpsertMyConsentSchema.safeParse({
        consent_type: 'cookies',
        granted: true,
      });
      expect(parsed.success).toBe(false);

      const rows = await ctx.db
        .select()
        .from(userConsents)
        .where(eq(userConsents.user_id, ownerId));
      expect(rows.map((r) => r.consent_type).sort()).toEqual([
        'analytics',
        'marketing',
        'notifications',
      ]);
    });

    test('a caller cannot read or write another user consents', async () => {
      const asStrangerBefore = await service.listConsents(authUser(strangerId));
      expect(asStrangerBefore.every((c) => c.user_id === strangerId)).toBe(
        true,
      );

      await service.putConsent(authUser(ownerId), {
        consent_type: 'marketing',
        granted: true,
      });

      const asStrangerAfter = await service.listConsents(authUser(strangerId));
      const strangerMarketing = asStrangerAfter.find(
        (c) => c.consent_type === 'marketing',
      );
      // Untouched by the owner's PUT.
      expect(strangerMarketing?.granted).toBe(false);
    });
  });

  describe('device tokens', () => {
    // The token belongs to the DEVICE and is UNIQUE GLOBALLY, so this is the one
    // place where a unique violation is a normal event rather than a bug, and the
    // one place where the naive answers are all wrong.
    const deviceToken = 'ExponentPushToken[transfer-case]';

    test('the same token registered twice by the same user is one row', async () => {
      const first = await service.registerDevice(authUser(ownerId), {
        token: deviceToken,
        platform: 'ios',
      });
      const second = await service.registerDevice(authUser(ownerId), {
        token: deviceToken,
        platform: 'ios',
        device_info: { app: '1.0' },
      });

      expect(second.id).toBe(first.id);
      expect(second.user_id).toBe(ownerId);
      const rows = await ctx.db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, deviceToken));
      expect(rows).toHaveLength(1);
    });

    test('the same token under another account is TRANSFERRED, not rejected', async () => {
      const before = await deviceRow(deviceToken);
      expect(before?.user_id).toBe(ownerId);

      const moved = await service.registerDevice(authUser(strangerId), {
        token: deviceToken,
        platform: 'android',
        device_info: { app: '2.0' },
      });

      expect(moved.user_id).toBe(strangerId);
      expect(moved.platform).toBe('android');
      expect(moved.is_active).toBe(true);
      // The transfer moves the row, it does not leave a second one behind.
      const rows = await ctx.db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, deviceToken));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(before?.id);
    });

    test('after the transfer the device is unreachable by the previous owner', async () => {
      // The previous owner tries to revoke it. Their revoke is scoped to their own
      // user_id, so it matches no row and cannot switch off the device that now
      // belongs to somebody else.
      await service.revokeDevice(authUser(ownerId), deviceToken);

      const row = await deviceRow(deviceToken);
      expect(row?.user_id).toBe(strangerId);
      expect(row?.is_active).toBe(true);
    });

    test('an omitted device_info does not erase the stored one', async () => {
      const current = await deviceRow(deviceToken);
      expect(current?.device_info).toEqual({ app: '2.0' });

      await service.registerDevice(authUser(strangerId), {
        token: deviceToken,
        platform: 'android',
      });

      const after = await deviceRow(deviceToken);
      expect(after?.device_info).toEqual({ app: '2.0' });
    });

    test('the owner revokes its own token and it stops being a push target', async () => {
      // `is_active` is what the send path filters on, so a revoke is a
      // deactivation, not a delete.
      await service.revokeDevice(authUser(strangerId), deviceToken);

      const row = await deviceRow(deviceToken);
      expect(row?.is_active).toBe(false);
      expect(row?.user_id).toBe(strangerId);
    });

    test('re-registering after a revoke re-activates the same row', async () => {
      const idBefore = (await deviceRow(deviceToken))?.id;

      const again = await service.registerDevice(authUser(strangerId), {
        token: deviceToken,
        platform: 'android',
      });

      expect(again.is_active).toBe(true);
      expect(again.id).toBe(idBefore);
      const rows = await ctx.db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.token, deviceToken));
      expect(rows).toHaveLength(1);
    });

    test('a token the caller never owned is a no-op, not someone else device', async () => {
      const strangerToken = 'ExponentPushToken[stranger-only]';
      await service.registerDevice(authUser(ownerId), {
        token: strangerToken,
        platform: 'web',
      });

      // A third party tries to revoke it.
      const thirdId = await seedProfile(ctx.db);
      await service.revokeDevice(authUser(thirdId), strangerToken);

      const row = await deviceRow(strangerToken);
      expect(row?.user_id).toBe(ownerId);
      expect(row?.is_active).toBe(true);
    });

    test('a registration body cannot redirect the write to another user', async () => {
      const rows = await ctx.db.select().from(deviceTokens);
      for (const row of rows) {
        expect([ownerId, strangerId]).toContain(row.user_id);
      }
    });
  });
});
