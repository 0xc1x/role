import { Test } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { BusinessSalesStatsQuerySchema } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BusinessOwnerStatsController } from './business-owner-stats.controller';
import { BusinessOwnerStatsService } from './business-owner-stats.service';

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

describe('BusinessOwnerStatsController', () => {
  let controller: BusinessOwnerStatsController;
  let reflector: Reflector;
  let service: jest.Mocked<BusinessOwnerStatsService>;
  const user: AuthUser = { id: 'owner-1', role: 'business', email: 'o@x.cl' };
  const businessId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const window = {
    from: '2026-03-01T00:00:00.000Z',
    to: '2026-03-31T23:59:59.999Z',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessOwnerStatsController],
      providers: [
        {
          provide: BusinessOwnerStatsService,
          useValue: {
            getCompletedOrders: jest.fn(),
            getSalesStats: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BusinessOwnerStatsController);
    service = module.get(BusinessOwnerStatsService);
    reflector = module.get(Reflector);
  });

  /**
   * The route table, read off the Nest metadata rather than off a comment: the
   * class-level prefix plus the per-handler path, with the global prefix
   * (`api/v1`, set in `main.ts`) prepended so the strings are the ones a client
   * actually calls.
   */
  const routes = (): string[] => {
    const prefix = Reflect.getMetadata(
      PATH_METADATA,
      BusinessOwnerStatsController,
    ) as string;
    const own = Object.getOwnPropertyNames(
      BusinessOwnerStatsController.prototype,
    ).filter((name) => name !== 'constructor');
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
        const segments = [prefix, path === '/' ? '' : path].filter(Boolean);
        return `${METHOD_NAMES[method]} /api/v1/${segments.join('/')}`;
      })
      .sort();
  };

  it('exposes exactly the two owner aggregates, and nothing else', () => {
    expect(routes()).toEqual([
      'GET /api/v1/businesses/:businessId/stats/completed-orders',
      'GET /api/v1/businesses/:businessId/stats/sales',
    ]);
  });

  it('no route is public, even though the SQL function behind it is', () => {
    // The live `business_completed_orders_count` is `SECURITY DEFINER set
    // search_path = ''` with EXECUTE granted to `anon, authenticated,
    // service_role`, because a PUBLIC business profile needs that aggregate and
    // must not need order rows to get it. This API is a BFF for the panel and the
    // consumer app, not a public profile host, so inheriting a public-by-
    // construction revenue number would be a new disclosure rather than a
    // convenience. The default-deny AuthGuard is the whole answer here.
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });

  it('every route is role-restricted to a business account or an admin', () => {
    // The coarse pre-filter every per-business route in this module carries. It
    // is NOT the authorisation — `assertCanViewBusiness` is — and a role check on
    // its own would be satisfied by any account on the platform.
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(ROLES_KEY, handler)).toEqual(['business', 'admin']);
    }
  });

  it('no handler takes a body, so no handler can take a business_id or a user_id', () => {
    // THE STRONGEST FORM OF "THE OWNER CANNOT COME FROM THE REQUEST", the same
    // one `payment-methods.controller.spec.ts` uses. This controller declares no
    // `@Body` at all: the owner is a path segment, the period is a query object,
    // and there is no request body to strip an id out of. Arity is what proves
    // it — the token subject, the business id, and at most the validated window.
    // Adding a DTO parameter to either signature fails here.
    expect(
      BusinessOwnerStatsController.prototype.getCompletedOrders.length,
    ).toBe(2);
    expect(BusinessOwnerStatsController.prototype.getSalesStats.length).toBe(3);
  });

  it('every handler delegates the token subject and the path id, unchanged', () => {
    service.getCompletedOrders.mockResolvedValue(undefined as never);
    service.getSalesStats.mockResolvedValue(undefined as never);

    controller.getCompletedOrders(user, businessId);
    controller.getSalesStats(user, businessId, window);

    // The two arguments are the caller and the path. There is no third that could
    // name a different account, and no body that could redirect either of them.
    expect(service.getCompletedOrders).toHaveBeenCalledWith(user, businessId);
    expect(service.getSalesStats).toHaveBeenCalledWith(
      user,
      businessId,
      window,
    );
  });

  it('the period is a QUERY, and both of its ends are required by the schema', () => {
    // A query rather than a path segment because an instant is not path-safe
    // (`2026-09-01T00:00:00.000Z` carries colons) and because the two ends are a
    // PAIR. Required, with no server default: the SQL function has no "all time"
    // branch, so any default would be a window this API invented.
    expect(BusinessSalesStatsQuerySchema.safeParse({}).success).toBe(false);
    expect(
      BusinessSalesStatsQuerySchema.safeParse({
        from: '2026-03-01T00:00:00Z',
        to: '2026-03-31T23:59:59Z',
      }).success,
    ).toBe(true);
  });
});
