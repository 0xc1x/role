import { ForbiddenException } from '@nestjs/common';
import { BusinessSalesStatsQuerySchema } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessOwnerStatsMapper } from './business-owner-stats.mapper';
import type { BusinessOwnerStatsRepository } from './business-owner-stats.repository';
import { BusinessOwnerStatsService } from './business-owner-stats.service';
import type { BusinessesService } from './businesses.service';

const businessId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const otherBusinessId = '3b1c9d20-1f4e-4a6b-9c11-77aa11bb22cc';

const owner: AuthUser = { id: 'owner-1', role: 'business', email: 'o@x.cl' };
const stranger: AuthUser = { id: 'other-1', role: 'business', email: 's@x.cl' };
const admin: AuthUser = { id: 'admin-1', role: 'admin', email: 'a@x.cl' };

const window = {
  from: '2026-03-01T00:00:00.000Z',
  to: '2026-03-31T23:59:59.999Z',
};

describe('BusinessOwnerStatsService', () => {
  let service: BusinessOwnerStatsService;
  let businesses: { assertCanViewBusiness: jest.Mock };
  let stats: {
    completedOrders: jest.Mock;
    sales: jest.Mock;
  };

  beforeEach(() => {
    businesses = { assertCanViewBusiness: jest.fn() };
    stats = {
      completedOrders: jest.fn().mockResolvedValue({ completed_orders: 7 }),
      sales: jest.fn().mockResolvedValue({
        orders_count: 0,
        revenue: '0',
        top_products: [],
        daily: [],
      }),
    };
    service = new BusinessOwnerStatsService(
      businesses as unknown as BusinessesService,
      stats as unknown as BusinessOwnerStatsRepository,
    );
  });

  describe('the ownership gate runs BEFORE the aggregate, not after it', () => {
    // THE ASSERTION THIS MODULE EXISTS FOR. In Supabase the equivalent safety is
    // a property of the FUNCTION: `business_completed_orders_count` is
    // SECURITY DEFINER, and the other two run under the caller's `orders` RLS.
    // Neither holds on this connection, which OWNS `orders` and is exempt from
    // every policy on it. So the check has to be a line of code in the request
    // path — and if it ran after the query, a merchant's revenue would have been
    // read out of the table and then thrown away, which is a disclosure even
    // though the response is a 403.
    it('an unowned business is refused and the count is NEVER computed', async () => {
      businesses.assertCanViewBusiness.mockRejectedValue(
        new ForbiddenException('You can only access businesses you own'),
      );

      await expect(
        service.getCompletedOrders(stranger, businessId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stats.completedOrders).not.toHaveBeenCalled();

      await expect(
        service.getSalesStats(stranger, businessId, window),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stats.sales).not.toHaveBeenCalled();
    });

    it('the assertion is called with the CALLER and the PATH id, in that order', async () => {
      await service.getCompletedOrders(owner, businessId);

      expect(businesses.assertCanViewBusiness).toHaveBeenCalledTimes(1);
      expect(businesses.assertCanViewBusiness).toHaveBeenCalledWith(
        owner,
        businessId,
      );
    });

    it('it is the SAME assertion every other business route uses, not a fourth copy', async () => {
      // `assertCanViewBusiness` is `BusinessesService`'s, made public for this.
      // The predicate has already been copied twice in this codebase
      // (OrdersRepository.isBusinessOwner, OffersRepository.isBusinessOwner), and
      // that is how "is this my business?" ends up answered three slightly
      // different ways.
      const { BusinessesService: Real } = await import('./businesses.service');
      const repository = { isOwner: jest.fn().mockResolvedValue(false) };
      const config = {
        get: (key: string) =>
          ({
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
          })[key],
      } as never;
      const real = new Real(
        repository as never,
        config,
        {} as never,
        {} as never,
      );

      await expect(
        real.assertCanViewBusiness(owner, businessId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.isOwner).toHaveBeenCalledWith(businessId, owner.id);
    });
  });

  describe('what the owner sees', () => {
    it('the count comes back with the business it is about', async () => {
      const answer = await service.getCompletedOrders(owner, businessId);

      expect(answer).toEqual({
        business_id: businessId,
        completed_orders: 7,
      });
      expect(stats.completedOrders).toHaveBeenCalledWith(businessId);
    });

    it('the window is echoed next to the numbers, and parsed as instants', async () => {
      const answer = await service.getSalesStats(owner, businessId, window);

      expect(answer.period).toEqual(window);
      // The repository gets DATES, not the strings: the comparison is against a
      // timestamptz and `new Date` is where the string stops being a string.
      expect(stats.sales).toHaveBeenCalledWith(businessId, {
        from: new Date(window.from),
        to: new Date(window.to),
      });
    });

    it('an offset other than Z is accepted and still means the same instant', async () => {
      // `-04:00` is the same moment as `00:00Z`; a client that sends a local
      // offset is stating an instant, not a day, and this route honours that.
      const parsed = BusinessSalesStatsQuerySchema.parse({
        from: '2026-03-01T00:00:00-04:00',
        to: '2026-03-31T23:59:59-04:00',
      });

      const answer = await service.getSalesStats(owner, businessId, parsed);

      expect(stats.sales).toHaveBeenCalledWith(businessId, {
        from: new Date('2026-03-01T04:00:00.000Z'),
        to: new Date('2026-04-01T03:59:59.000Z'),
      });
      // Echoed verbatim, not normalised: the caller gets back what it sent, so a
      // bug in ITS date maths is visible instead of silently absorbed.
      expect(answer.period).toEqual(parsed);
    });

    it('admin passes the gate and gets the same numbers', async () => {
      // Admin is the one role the module lets through on role alone, exactly as
      // `GET /businesses/:id` and every other business route here does.
      const answer = await service.getCompletedOrders(admin, otherBusinessId);

      expect(businesses.assertCanViewBusiness).toHaveBeenCalledWith(
        admin,
        otherBusinessId,
      );
      expect(answer.business_id).toBe(otherBusinessId);
      expect(answer.completed_orders).toBe(7);
    });
  });
});

describe('BusinessSalesStatsQuerySchema', () => {
  const ok = (from: string, to: string) =>
    BusinessSalesStatsQuerySchema.safeParse({ from, to });

  it('requires BOTH ends — there is no default period', () => {
    expect(ok('2026-03-01T00:00:00Z', '2026-03-31T23:59:59Z').success).toBe(
      true,
    );
    expect(BusinessSalesStatsQuerySchema.safeParse({}).success).toBe(false);
    expect(
      BusinessSalesStatsQuerySchema.safeParse({ from: '2026-03-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(
      BusinessSalesStatsQuerySchema.safeParse({ to: '2026-03-31T23:59:59Z' })
        .success,
    ).toBe(false);
  });

  it('refuses an inverted window instead of reporting a well-formed nothing', () => {
    const inverted = ok('2026-03-31T00:00:00Z', '2026-03-01T00:00:00Z');
    expect(inverted.success).toBe(false);
    if (!inverted.success) {
      expect(inverted.error.issues[0]?.path).toEqual(['to']);
    }
  });

  it('accepts a window whose ends are the same instant', () => {
    // The SQL is `>= and <=`, so a zero-width window is the one order at exactly
    // that instant. Refusing it would make the inclusive edges unreachable.
    expect(ok('2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z').success).toBe(
      true,
    );
  });

  it("refuses a bare date, which would leave midnight to somebody's timezone", () => {
    // `TimestamptzSchema` is deliberately lax because RESPONSES carry `+00:00`.
    // This is an INPUT that is about to be compared against `orders.created_at`
    // and bucketed by UTC day, and a bare `2026-03-01` would leave the API to
    // pick midnight in SOME zone — the exact silent shift the daily bucketing
    // exists to prevent.
    expect(ok('2026-03-01', '2026-03-31').success).toBe(false);
    expect(ok('2026-03-01T00:00:00', '2026-03-31T00:00:00').success).toBe(
      false,
    );
  });
});

describe('BusinessOwnerStatsMapper', () => {
  it('rounds money and passes the counts through', () => {
    const dto = BusinessOwnerStatsMapper.toSalesStatsDto(businessId, {
      orders_count: 3,
      // `sum(numeric)` arrives as the string Postgres sends; the mapper owns the
      // rounding, exactly as RevenueStatsMapper does.
      revenue: '123.4567',
      top_products: [{ name: 'Pack', sold: 3, revenue: '61.7285' }],
      daily: [{ day: '2026-03-01', orders: 2, revenue: '61.7285' }],
    });

    expect(dto.revenue).toBe(123.46);
    expect(dto.top_products[0]?.revenue).toBe(61.73);
    expect(dto.daily[0]?.revenue).toBe(61.73);
    expect(dto.top_products[0]?.sold).toBe(3);
    expect(dto.orders_count).toBe(3);
    // The order the SQL chose is preserved, not re-sorted.
    expect(dto.top_products[0]?.name).toBe('Pack');
  });

  it('the echoed business_id is the path, not something read off the aggregate', () => {
    expect(
      BusinessOwnerStatsMapper.toCompletedOrdersDto(businessId, {
        completed_orders: 0,
      }),
    ).toEqual({ business_id: businessId, completed_orders: 0 });
  });
});
