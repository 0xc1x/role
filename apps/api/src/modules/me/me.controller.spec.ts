import { Test } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { MeController } from './me.controller';
import { MeService } from './me.service';

const METHOD_NAMES: Record<RequestMethod, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.SEARCH]: 'SEARCH',
};

describe('MeController', () => {
  let controller: MeController;
  let reflector: Reflector;
  let me: jest.Mocked<MeService>;
  const user: AuthUser = { id: 'user-1', role: 'user', email: 'u@x.cl' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: MeService,
          useValue: {
            getAccount: jest.fn(),
            updateProfile: jest.fn(),
            getPreferences: jest.fn(),
            updatePreferences: jest.fn(),
            getNotificationPreferences: jest.fn(),
            updateNotificationPreferences: jest.fn(),
            getMarketingPreferences: jest.fn(),
            updateMarketingPreferences: jest.fn(),
            getOrderStats: jest.fn(),
            listConsents: jest.fn(),
            putConsent: jest.fn(),
            registerDevice: jest.fn(),
            revokeDevice: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(MeController);
    me = module.get(MeService);
    reflector = module.get(Reflector);
  });

  /**
   * The route table, read off the Nest metadata rather than off a comment: the
   * class-level prefix (`me`) plus the per-handler path, with the global prefix
   * (`api/v1`, set in `main.ts`) prepended so the strings are the ones a client
   * actually calls.
   */
  const routes = (): string[] => {
    const prefix = Reflect.getMetadata(PATH_METADATA, MeController) as string;
    const own = Object.getOwnPropertyNames(MeController.prototype).filter(
      (name) => name !== 'constructor',
    );
    return own
      .filter((name) => Reflect.getMetadata(PATH_METADATA, controller[name]))
      .map((name) => {
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          controller[name],
        ) as RequestMethod;
        const path = Reflect.getMetadata(
          PATH_METADATA,
          controller[name],
        ) as string;
        // `@Get()` with no argument records the path as '/', not as an empty
        // string, so it has to be normalised before it is joined.
        const segments = [prefix, path === '/' ? '' : path].filter(Boolean);
        return `${METHOD_NAMES[method]} /api/v1/${segments.join('/')}`;
      })
      .sort();
  };

  it('exposes exactly the account routes, under /me', () => {
    expect(routes()).toEqual([
      'DELETE /api/v1/me/devices',
      'GET /api/v1/me',
      'GET /api/v1/me/consents',
      'GET /api/v1/me/marketing-preferences',
      'GET /api/v1/me/notification-preferences',
      'GET /api/v1/me/order-stats',
      'GET /api/v1/me/preferences',
      'PATCH /api/v1/me',
      'PATCH /api/v1/me/marketing-preferences',
      'PATCH /api/v1/me/notification-preferences',
      'PATCH /api/v1/me/preferences',
      'POST /api/v1/me/devices',
      'PUT /api/v1/me/consents',
    ]);
  });

  /**
   * The whole authorisation story of this controller, in one assertion.
   *
   * `GET /me/order-stats` mirrors `public.user_order_stats(p_user_id)`, a SQL
   * function that takes the caller's id as a PARAMETER. That is safe in Supabase
   * only because it runs under the caller's RLS; there is no RLS in this request
   * path, since the pooler role OWNS `orders` and answers to none of its policies.
   * So the way this API keeps the function's safety is refusing to accept the
   * parameter at all — and the way that is PROVEN is arity: no handler on this
   * controller takes more than the token subject plus a settings body whose
   * schema has no owner column.
   *
   * Same shape as `payment-methods.controller.spec.ts`'s "no handler takes a
   * user_id". A `?user_id=` on `GET /me/order-stats` fails here.
   */
  it('no handler takes a user_id, and no handler takes an owner at all', () => {
    // Every GET on this controller takes the token subject and nothing else, so
    // there is no argument that could name another account.
    expect(MeController.prototype.getAccount.length).toBe(1);
    expect(MeController.prototype.getPreferences.length).toBe(1);
    expect(MeController.prototype.getNotificationPreferences.length).toBe(1);
    expect(MeController.prototype.getMarketingPreferences.length).toBe(1);
    expect(MeController.prototype.getOrderStats.length).toBe(1);
    expect(MeController.prototype.listConsents.length).toBe(1);
    // And the writes take the subject plus a body the Zod pipe has already
    // stripped: `UpdateMyMarketingPreferencesSchema` has no `user_id`,
    // `unsubscribed_at` or `source` key, so none of them can reach a write.
    expect(MeController.prototype.updateMarketingPreferences.length).toBe(2);
    expect(MeController.prototype.updateProfile.length).toBe(2);
    expect(MeController.prototype.updatePreferences.length).toBe(2);
    expect(MeController.prototype.updateNotificationPreferences.length).toBe(2);
  });

  it('no route is public: the global AuthGuard is default-deny', () => {
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });

  it('no route is role-restricted, not even for an admin token', () => {
    // A business account editing its own profile, preferences and consents is a
    // consumer action, not an admin one. The existing admin `PATCH /profiles/{id}`
    // is a different controller and is untouched by this.
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  it('every handler delegates the token subject, and no handler takes an id', () => {
    me.getAccount.mockReturnValue(undefined as never);
    me.getPreferences.mockReturnValue(undefined as never);
    me.getNotificationPreferences.mockReturnValue(undefined as never);
    me.getMarketingPreferences.mockReturnValue(undefined as never);
    me.getOrderStats.mockReturnValue(undefined as never);
    me.listConsents.mockReturnValue(undefined as never);
    me.revokeDevice.mockReturnValue(undefined as never);

    controller.getAccount(user);
    controller.updateProfile(user, { city: 'Providencia' });
    controller.getPreferences(user);
    controller.updatePreferences(user, { notification_radius_km: 10 });
    controller.getNotificationPreferences(user);
    controller.updateNotificationPreferences(user, { push_enabled: false });
    controller.getMarketingPreferences(user);
    controller.updateMarketingPreferences(user, { is_subscribed: false });
    controller.getOrderStats(user);
    controller.listConsents(user);
    controller.putConsent(user, { consent_type: 'analytics', granted: true });
    controller.registerDevice(user, {
      token: 'ExponentPushToken[x]',
      platform: 'ios',
    });
    controller.revokeDevice(user, { token: 'ExponentPushToken[x]' });

    // The owner is the first argument everywhere, and it is the CALLER's: the
    // route has no id to widen and the request schemas have no owner column.
    expect(me.getAccount).toHaveBeenCalledWith(user);
    expect(me.updateProfile).toHaveBeenCalledWith(user, {
      city: 'Providencia',
    });
    expect(me.getPreferences).toHaveBeenCalledWith(user);
    expect(me.updatePreferences).toHaveBeenCalledWith(user, {
      notification_radius_km: 10,
    });
    expect(me.getNotificationPreferences).toHaveBeenCalledWith(user);
    expect(me.updateNotificationPreferences).toHaveBeenCalledWith(user, {
      push_enabled: false,
    });
    // Marketing is its own TABLE, not a second notification-preferences route:
    // `consumer_notification_preferences` is the two flags above and
    // `business_notification_preferences` is the merchant's counterpart of them.
    expect(me.getMarketingPreferences).toHaveBeenCalledWith(user);
    expect(me.updateMarketingPreferences).toHaveBeenCalledWith(user, {
      is_subscribed: false,
    });
    // The aggregate takes the subject and nothing else — no `user_id` anywhere.
    expect(me.getOrderStats).toHaveBeenCalledWith(user);
    expect(me.listConsents).toHaveBeenCalledWith(user);
    expect(me.putConsent).toHaveBeenCalledWith(user, {
      consent_type: 'analytics',
      granted: true,
    });
    expect(me.registerDevice).toHaveBeenCalledWith(user, {
      token: 'ExponentPushToken[x]',
      platform: 'ios',
    });
    // Revoke is by TOKEN, never by row id: the token is the client's only
    // identity for a push registration.
    expect(me.revokeDevice).toHaveBeenCalledWith(user, 'ExponentPushToken[x]');
  });
});
