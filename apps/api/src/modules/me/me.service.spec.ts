import { Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  RegisterMyDeviceSchema,
  UpdateMyPreferencesSchema,
  UpdateMyProfileSchema,
  UpsertMyConsentSchema,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import type { CategoriesRepository } from '../categories/categories.repository';
import { MeService } from './me.service';
import type { MeRepository } from './me.repository';

const user: AuthUser = { id: 'user-1', email: 'u@test.cl', role: 'user' };

const now = new Date('2026-01-01T00:00:00.000Z');

const makeProfileRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'u@test.cl',
  full_name: 'Ana',
  avatar_url: null,
  phone: null,
  role: 'user' as const,
  city: null,
  created_at: now,
  updated_at: now,
  ...overrides,
});

const makePreferencesRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pref-1',
  user_id: 'user-1',
  notification_radius_km: 5,
  favorite_categories: [],
  language: 'es',
  theme_mode: 'system',
  created_at: now,
  updated_at: now,
  ...overrides,
});

const makeNotificationPreferencesRow = (
  overrides: Record<string, unknown> = {},
) => ({
  user_id: 'user-1',
  push_enabled: true,
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  favorite_alerts_enabled: true,
  pickup_reminders_enabled: true,
  last_minute_deals_enabled: false,
  weekly_summary_enabled: true,
  quiet_hours_from: null,
  quiet_hours_to: null,
  created_at: now,
  updated_at: now,
  ...overrides,
});

const makeMarketingPreferencesRow = (
  overrides: Record<string, unknown> = {},
) => ({
  user_id: 'user-1',
  is_subscribed: true,
  categories: ['announcements'],
  unsubscribed_at: null,
  source: 'app',
  updated_at: now,
  ...overrides,
});

describe('MeService', () => {
  let service: MeService;
  let me: jest.Mocked<MeRepository>;
  let categories: jest.Mocked<CategoriesRepository>;

  beforeEach(() => {
    me = {
      readAccount: jest.fn(),
      findProfile: jest.fn(),
      updateProfile: jest.fn(),
      findPreferences: jest.fn(),
      updatePreferences: jest.fn(),
      findNotificationPreferences: jest.fn(),
      updateNotificationPreferences: jest.fn(),
      findMarketingPreferences: jest.fn(),
      upsertMarketingPreferences: jest.fn(),
      userOrderStats: jest.fn(),
      listConsents: jest.fn(),
      upsertConsent: jest.fn(),
      registerDevice: jest.fn(),
      revokeDevice: jest.fn(),
    } as unknown as jest.Mocked<MeRepository>;

    categories = {
      listMatchable: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepository>;

    // The catalog `dispatch-nearby-offers` can actually match: the Spanish
    // display name, with an ASCII-folded slug alongside it.
    categories.listMatchable.mockResolvedValue([
      { id: 'c1', name: 'Panadería', slug: 'panaderia' },
      { id: 'c2', name: 'Frutería', slug: 'fruteria' },
    ]);

    service = new MeService(me, categories);
  });

  describe('getAccount', () => {
    it('returns the profile, both settings rows and the consents together', async () => {
      me.readAccount.mockResolvedValue({
        profile: makeProfileRow() as never,
        preferences: makePreferencesRow() as never,
        notificationPreferences: makeNotificationPreferencesRow() as never,
        consents: [
          {
            id: 'cons-1',
            user_id: 'user-1',
            consent_type: 'analytics',
            granted: false,
            granted_at: null,
            revoked_at: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.getAccount(user);

      expect(me.readAccount).toHaveBeenCalledWith('user-1');
      expect(result.profile).toMatchObject({
        id: 'user-1',
        email: 'u@test.cl',
        role: 'user',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      expect(result.preferences).toMatchObject({ theme_mode: 'system' });
      expect(result.notification_preferences).toMatchObject({
        push_enabled: true,
      });
      expect(result.consents).toHaveLength(1);
    });

    it('reads the caller, and only the caller', async () => {
      me.readAccount.mockResolvedValue({
        profile: makeProfileRow() as never,
        preferences: null,
        notificationPreferences: null,
        consents: [],
      });

      await service.getAccount({ ...user, role: 'admin' });

      // A business or an admin account editing its own account is not an admin
      // action, so the owner is the token subject and nothing widens it.
      expect(me.readAccount).toHaveBeenCalledWith('user-1');
    });

    it('reports missing settings rows as null instead of inventing or failing', async () => {
      // The preferences rows are seeded by the trigger chain and by
      // UserDefaultsService, but this API never wrote them. A missing row is a
      // state the caller must be able to read, not a 404 and not an insert.
      me.readAccount.mockResolvedValue({
        profile: makeProfileRow() as never,
        preferences: null,
        notificationPreferences: null,
        consents: [],
      });

      const result = await service.getAccount(user);

      expect(result.preferences).toBeNull();
      expect(result.notification_preferences).toBeNull();
      expect(result.consents).toEqual([]);
      expect(me.updatePreferences).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      me.updateProfile.mockResolvedValue(makeProfileRow() as never);
    });

    it('cannot change the role: the field is absent from the parsed body', async () => {
      // STRUCTURAL, not a 403. `role` is not a key of UpdateMyProfileSchema, so
      // the pipe hands the service a body that has no such property, and there
      // is nothing for a check to reject. The API writes `profiles` as the table
      // owner, so RLS and the column grants cannot be what stops this.
      const parsed = UpdateMyProfileSchema.parse({
        role: 'admin',
        full_name: 'Ana',
      });

      expect('role' in parsed).toBe(false);
      expect(Object.keys(parsed)).toEqual(['full_name']);

      await service.updateProfile(user, parsed);

      expect(me.updateProfile).toHaveBeenCalledWith('user-1', {
        full_name: 'Ana',
      });
      const patch = me.updateProfile.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patch).not.toHaveProperty('role');
    });

    it('writes only the columns the body named', async () => {
      await service.updateProfile(user, { city: 'Providencia' });

      expect(me.updateProfile).toHaveBeenCalledWith('user-1', {
        city: 'Providencia',
      });
    });

    it('accepts avatar_url as a URL, because that is all it is', async () => {
      // There is no consumer upload path in this API: `POST /upload/image` is
      // admin-only. The field stores a link the client already has.
      await service.updateProfile(user, {
        avatar_url: 'https://cdn.example/a.png',
      });

      expect(me.updateProfile).toHaveBeenCalledWith('user-1', {
        avatar_url: 'https://cdn.example/a.png',
      });
    });

    it('refuses an email change and names the path that works', async () => {
      await expect(
        service.updateProfile(user, { email: 'new@correo.cl' }),
      ).rejects.toThrow(UnprocessableEntityException);

      // The refusal is the whole answer: no column write, so `profiles.email`
      // and the GoTrue identity cannot be left disagreeing.
      expect(me.updateProfile).not.toHaveBeenCalled();
      await expect(
        service.updateProfile(user, { email: 'new@correo.cl' }),
      ).rejects.toThrow(/supabase\.auth\.updateUser/);
    });

    it('is 422 rather than a silent strip, and never writes the column', async () => {
      // The admin surface drops `email` from the body and answers 200. A caller
      // who asked to change their address and got a 200 was lied to.
      let thrown: unknown;
      try {
        await service.updateProfile(user, { email: 'new@correo.cl' });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(UnprocessableEntityException);
      const response = (thrown as UnprocessableEntityException).getResponse();
      expect(JSON.stringify(response)).toContain('email');
      // The refusal is only useful if it points somewhere that works. Both
      // routes are real: this API's `POST /auth/change-email`, and the Supabase
      // client for a consumer app that talks to GoTrue directly (ADR-0002).
      expect(JSON.stringify(response)).toContain('/auth/change-email');
    });

    it('passes a null through so a field can be cleared', async () => {
      await service.updateProfile(user, { phone: null, city: null });

      expect(me.updateProfile).toHaveBeenCalledWith('user-1', {
        phone: null,
        city: null,
      });
    });
  });

  describe('updatePreferences / favorite_categories', () => {
    beforeEach(() => {
      me.updatePreferences.mockResolvedValue(makePreferencesRow() as never);
    });

    it('stores the canonical display name for a value that matches', async () => {
      // `dispatch-nearby-offers` lowercases `categories.name` and compares it
      // against a lowercased copy of this array. The stored string has to be the
      // name for the comparison to ever be true.
      await service.updatePreferences(user, {
        favorite_categories: ['Panadería'],
      });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        favorite_categories: ['Panadería'],
      });
    });

    it('normalises case and surrounding whitespace instead of rejecting them', async () => {
      // A picker sends the name, a route carries the slug, a locale adds a
      // space. None of that is the user picking a different category, and
      // rejecting it teaches clients to stop sending the field.
      await service.updatePreferences(user, {
        favorite_categories: ['  panadería ', 'FRUTERÍA', 'Frutería'],
      });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        favorite_categories: ['Panadería', 'Frutería'],
      });
    });

    it('resolves a slug to the display name the dispatch compares against', async () => {
      // `categories.slug` is ASCII-folded and is NEVER what the dispatch
      // function compares. Storing a slug is the exact value that matches
      // nothing.
      await service.updatePreferences(user, {
        favorite_categories: ['panaderia'],
      });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        favorite_categories: ['Panadería'],
      });
    });

    it('rejects a value that cannot match and does not store a partial list', async () => {
      // The failure this prevents: the user picks three categories, one of them
      // is not in the catalog, the write succeeds, and the chosen categories
      // silently filter nothing while the UI reports them as selected.
      await expect(
        service.updatePreferences(user, {
          favorite_categories: ['Panadería', 'No existe', 'otra-cosa'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(me.updatePreferences).not.toHaveBeenCalled();
    });

    it('names the offending values and the catalog in the rejection', async () => {
      let thrown: unknown;
      try {
        await service.updatePreferences(user, {
          favorite_categories: ['Panadería', 'No existe'],
        });
      } catch (err) {
        thrown = err;
      }

      const response = (
        thrown as UnprocessableEntityException
      ).getResponse() as {
        details: { unmatched: string[] };
        allowed: string[];
      };
      expect(response.details.unmatched).toEqual(['No existe']);
      expect(response.allowed).toEqual(['Panadería', 'Frutería']);
    });

    it('accepts null as "no favourites" without touching the catalog', async () => {
      await service.updatePreferences(user, { favorite_categories: null });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        favorite_categories: null,
      });
      expect(categories.listMatchable).not.toHaveBeenCalled();
    });

    it('accepts an empty list, which is the same as none', async () => {
      await service.updatePreferences(user, { favorite_categories: [] });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        favorite_categories: [],
      });
    });

    it('leaves favorite_categories alone when the body does not name it', async () => {
      await service.updatePreferences(user, { notification_radius_km: 20 });

      expect(me.updatePreferences).toHaveBeenCalledWith('user-1', {
        notification_radius_km: 20,
      });
      expect(categories.listMatchable).not.toHaveBeenCalled();
    });

    it('rejects a radius the schema does not bound, before the service', async () => {
      expect(
        UpdateMyPreferencesSchema.safeParse({ notification_radius_km: 0 })
          .success,
      ).toBe(false);
      expect(
        UpdateMyPreferencesSchema.safeParse({ notification_radius_km: 50_000 })
          .success,
      ).toBe(false);
      expect(
        UpdateMyPreferencesSchema.safeParse({ notification_radius_km: 25 })
          .success,
      ).toBe(true);
    });

    it('rejects a radius body that also tries to carry user_id', async () => {
      const parsed = UpdateMyPreferencesSchema.parse({
        user_id: 'someone-else',
        language: 'en',
      });

      expect('user_id' in parsed).toBe(false);
    });
  });

  describe('updateNotificationPreferences', () => {
    beforeEach(() => {
      me.findNotificationPreferences.mockResolvedValue(
        makeNotificationPreferencesRow() as never,
      );
      me.updateNotificationPreferences.mockResolvedValue(
        makeNotificationPreferencesRow() as never,
      );
    });

    it('writes the flags it was given', async () => {
      await service.updateNotificationPreferences(user, {
        push_enabled: false,
        sms_enabled: true,
      });

      expect(me.updateNotificationPreferences).toHaveBeenCalledWith('user-1', {
        push_enabled: false,
        sms_enabled: true,
      });
    });

    it('refuses a half-configured quiet window instead of storing an inert one', async () => {
      // `filterNotInQuietHours` treats a window with only one end as NO window,
      // so this write would store a setting the user believes is on and that
      // does nothing. Same failure class as an unmatchable category.
      await expect(
        service.updateNotificationPreferences(user, {
          quiet_hours_from: '22:00:00',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(me.updateNotificationPreferences).not.toHaveBeenCalled();
    });

    it('accepts moving one end when the other is already set on the row', async () => {
      // A schema cannot see the stored row, which is why the pairing is checked
      // here against the MERGED state and not in the request schema.
      me.findNotificationPreferences.mockResolvedValue(
        makeNotificationPreferencesRow({
          quiet_hours_from: '22:00:00',
          quiet_hours_to: '07:00:00',
        }) as never,
      );

      await service.updateNotificationPreferences(user, {
        quiet_hours_from: '23:00:00',
      });

      expect(me.updateNotificationPreferences).toHaveBeenCalledWith('user-1', {
        quiet_hours_from: '23:00:00',
      });
    });

    it('accepts both ends together and accepts clearing both', async () => {
      await service.updateNotificationPreferences(user, {
        quiet_hours_from: '22:00:00',
        quiet_hours_to: '07:00:00',
      });
      expect(me.updateNotificationPreferences).toHaveBeenLastCalledWith(
        'user-1',
        {
          quiet_hours_from: '22:00:00',
          quiet_hours_to: '07:00:00',
        },
      );

      await service.updateNotificationPreferences(user, {
        quiet_hours_from: null,
        quiet_hours_to: null,
      });
      expect(me.updateNotificationPreferences).toHaveBeenLastCalledWith(
        'user-1',
        {
          quiet_hours_from: null,
          quiet_hours_to: null,
        },
      );
    });

    it('clears an end explicitly without resurrecting the stored value', async () => {
      // `??` would turn an explicit null back into the stored time, so the
      // presence check is `in` and not a nullish fallback.
      me.findNotificationPreferences.mockResolvedValue(
        makeNotificationPreferencesRow({
          quiet_hours_from: '22:00:00',
          quiet_hours_to: '07:00:00',
        }) as never,
      );

      await service.updateNotificationPreferences(user, {
        quiet_hours_from: null,
        quiet_hours_to: null,
      });

      expect(me.updateNotificationPreferences).toHaveBeenCalledWith('user-1', {
        quiet_hours_from: null,
        quiet_hours_to: null,
      });
    });

    it('returns null when the row does not exist, without creating one', async () => {
      me.findNotificationPreferences.mockResolvedValue(null);
      me.updateNotificationPreferences.mockResolvedValue(null);

      const result = await service.updateNotificationPreferences(user, {
        push_enabled: false,
      });

      // An explicit null, not an empty 200 body: a bare `null` return would be
      // indistinguishable from a populated object to a client decoding JSON.
      expect(result).toEqual({ notification_preferences: null });
    });
  });

  describe('putConsent', () => {
    it('is keyed on the declared union, and the schema rejects anything else', () => {
      expect(
        UpsertMyConsentSchema.safeParse({
          consent_type: 'cookies',
          granted: true,
        }).success,
      ).toBe(false);
      expect(
        UpsertMyConsentSchema.safeParse({ consent_type: 'analytics' }).success,
      ).toBe(false);
      expect(
        UpsertMyConsentSchema.safeParse({
          consent_type: 'analytics',
          granted: true,
        }).success,
      ).toBe(true);
    });

    it('never writes a user_id, only the caller and the declared type', async () => {
      me.upsertConsent.mockResolvedValue({
        id: 'cons-1',
        user_id: 'user-1',
        consent_type: 'marketing',
        granted: true,
        granted_at: now,
        revoked_at: null,
        created_at: now,
        updated_at: now,
      } as never);

      const result = await service.putConsent(user, {
        consent_type: 'marketing',
        granted: true,
      });

      expect(me.upsertConsent).toHaveBeenCalledWith(
        'user-1',
        'marketing',
        true,
      );
      expect(result.user_id).toBe('user-1');
    });
  });

  describe('registerDevice', () => {
    const row = {
      id: 'dev-1',
      user_id: 'user-1',
      token: 'ExponentPushToken[abc]',
      platform: 'ios' as const,
      device_info: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    it('registers the caller id even when the body names another one', async () => {
      const parsed = RegisterMyDeviceSchema.parse({
        user_id: 'someone-else',
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
        is_active: false,
      });

      expect('user_id' in parsed).toBe(false);
      expect('is_active' in parsed).toBe(false);

      me.registerDevice.mockResolvedValue({
        row: row as never,
        previousUserId: null,
      });

      await service.registerDevice(user, parsed);

      expect(me.registerDevice).toHaveBeenCalledWith({
        userId: 'user-1',
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
        deviceInfo: undefined,
      });
    });

    it('returns the row as stored, always active', async () => {
      me.registerDevice.mockResolvedValue({
        row: row as never,
        previousUserId: null,
      });

      const result = await service.registerDevice(user, {
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      });

      expect(result).toMatchObject({
        id: 'dev-1',
        user_id: 'user-1',
        is_active: true,
      });
    });

    it('reports the transfer to the log, and never the token', async () => {
      // A push token is a device-held secret and `docs/operations.md` bans raw
      // secrets in logs. The ownership pair says everything an operator needs.
      me.registerDevice.mockResolvedValue({
        row: row as never,
        previousUserId: 'user-0',
      });
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await service.registerDevice(user, {
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      });

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('device_token_transferred');
      expect(logged).toContain('user-0');
      expect(logged).not.toContain('ExponentPushToken');
      warn.mockRestore();
    });

    it('does not call a re-registration a transfer', async () => {
      me.registerDevice.mockResolvedValue({
        row: row as never,
        previousUserId: 'user-1',
      });

      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await service.registerDevice(user, {
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      });

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('marketing preferences', () => {
    it('an account with no row reads as an explicit null', async () => {
      me.findMarketingPreferences.mockResolvedValue(null);

      await expect(service.getMarketingPreferences(user)).resolves.toEqual({
        marketing_preferences: null,
      });
    });

    it('the read is keyed on the token subject and takes nothing else', async () => {
      me.findMarketingPreferences.mockResolvedValue(
        makeMarketingPreferencesRow() as never,
      );

      await service.getMarketingPreferences(user);

      expect(me.findMarketingPreferences).toHaveBeenCalledWith('user-1');
    });

    it('only the two owned columns cross into the patch', async () => {
      me.upsertMarketingPreferences.mockResolvedValue(
        makeMarketingPreferencesRow() as never,
      );

      await service.updateMarketingPreferences(user, {
        is_subscribed: false,
        categories: ['news'],
      });

      // No `unsubscribed_at`, no `source`, no `updated_at`: those are derived in
      // the repository, and a patch that carried them would be a caller writing
      // its own compliance record.
      expect(me.upsertMarketingPreferences).toHaveBeenCalledWith('user-1', {
        is_subscribed: false,
        categories: ['news'],
      });
    });

    it('each key is optional on its own, and the other is left alone', async () => {
      me.upsertMarketingPreferences.mockResolvedValue(
        makeMarketingPreferencesRow() as never,
      );

      await service.updateMarketingPreferences(user, { is_subscribed: true });
      expect(me.upsertMarketingPreferences).toHaveBeenLastCalledWith('user-1', {
        is_subscribed: true,
      });

      await service.updateMarketingPreferences(user, { categories: ['news'] });
      expect(me.upsertMarketingPreferences).toHaveBeenLastCalledWith('user-1', {
        categories: ['news'],
      });
    });

    it('an empty body is a no-op patch, which the repository turns into a read', async () => {
      me.upsertMarketingPreferences.mockResolvedValue(null);

      const answer = await service.updateMarketingPreferences(user, {});

      expect(me.upsertMarketingPreferences).toHaveBeenCalledWith('user-1', {});
      expect(answer).toEqual({ marketing_preferences: null });
    });
  });

  describe('getOrderStats', () => {
    it("asks for the CALLER's aggregate and nothing else", async () => {
      // `public.user_order_stats(p_user_id)` takes the id as a PARAMETER, safe in
      // Supabase only because it runs under the caller's RLS. There is no RLS here
      // — the pooler role owns `orders` — so the id must not be an argument this
      // route can widen, and the only argument it has is the token subject.
      me.userOrderStats.mockResolvedValue({
        orders_count: 3,
        total_saved: '50.00',
      });

      const answer = await service.getOrderStats(user);

      expect(me.userOrderStats).toHaveBeenCalledWith('user-1');
      expect(answer).toEqual({
        order_stats: { orders_count: 3, total_saved: 50 },
      });
    });

    it('a negative saving is reported as it is, not floored to zero', async () => {
      // A discount that rounded against the customer is a fact about the data. A
      // `nonnegative()` floor would turn it into a 400 on a GET, and the sign is
      // the caller's to interpret.
      me.userOrderStats.mockResolvedValue({
        orders_count: 1,
        total_saved: '-3.50',
      });

      const answer = await service.getOrderStats(user);

      expect(answer.order_stats.total_saved).toBe(-3.5);
    });
  });

  describe('revokeDevice', () => {
    it('is scoped to the caller and does not report a token it never owned', async () => {
      // 204 either way: a sign-out must not become a failure the client has to
      // handle, and a token that has been transferred away is simply not the
      // caller's to switch off.
      me.revokeDevice.mockResolvedValue(false);

      await expect(
        service.revokeDevice(user, 'ExponentPushToken[abc]'),
      ).resolves.toBeUndefined();

      expect(me.revokeDevice).toHaveBeenCalledWith(
        'user-1',
        'ExponentPushToken[abc]',
      );
    });
  });
});
