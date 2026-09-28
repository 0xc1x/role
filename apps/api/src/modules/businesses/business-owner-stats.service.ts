import { Injectable } from '@nestjs/common';
import type {
  BusinessCompletedOrdersDto,
  BusinessSalesStatsQuery,
  BusinessSalesStatsResponseDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessOwnerStatsMapper } from './business-owner-stats.mapper';
import { BusinessOwnerStatsRepository } from './business-owner-stats.repository';
import { BusinessesService } from './businesses.service';

/**
 * THE TWO OWNER-GATED AGGREGATES: `business_completed_orders_count` and
 * `business_sales_stats`.
 *
 * WHY THEY ARE NOT IN THE `stats` MODULE, which is the placement question this
 * surface exists to answer. `StatsModule` holds two routes and both of them have
 * the same property: NO OWNER IS INVOLVED. `GET /stats/platform` is `@Public()`
 * and counts rows across the whole platform; `GET /stats/revenue` is
 * `@Roles('admin')` and reports the platform's own money. That module's
 * invariant is "the guard is the whole story" — there is no path parameter whose
 * value has to be resolved against anything.
 *
 * These two break that invariant. Their entire authorisation is
 * `business_ownership`, and their business id arrives in the PATH, where a
 * reader who has just skimmed `StatsController` would not expect it to matter.
 * The same reasoning put the consumer aggregate on `/me` instead: `MeController`'s
 * invariant is "nothing here takes an id", and a `?user_id=` on a route whose
 * siblings all take no parameters is precisely the thing that turns a comment
 * into a lie. So each aggregate lives where its own ownership story is the
 * module's headline, and `stats` keeps meaning "nobody's numbers in particular".
 *
 * EVERY METHOD CALLS `assertCanViewBusiness` FIRST, and the repository is
 * injected behind that call rather than reached from the handler. In Supabase the
 * equivalent safety is a property of the FUNCTION — `SECURITY DEFINER` on
 * `business_completed_orders_count`, the caller's own RLS on the other two — and
 * neither exists on this connection, which owns `orders`. The check therefore has
 * to be a line of code in the request path, and it has to be the FIRST thing that
 * happens, because an aggregate that is computed and then discarded is a
 * merchant's revenue read out of the table and thrown away.
 */
@Injectable()
export class BusinessOwnerStatsService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly stats: BusinessOwnerStatsRepository,
  ) {}

  /**
   * `GET /businesses/:businessId/stats/completed-orders`.
   *
   * Counts `completed` and nothing else, which is narrower than the consumer
   * aggregate's "not cancelled". The asymmetry is the SQL's, both clients were
   * built against it, and it is preserved here — see
   * `BusinessOwnerStatsRepository.completedOrders`.
   */
  async getCompletedOrders(
    user: AuthUser,
    businessId: string,
  ): Promise<BusinessCompletedOrdersDto> {
    await this.businesses.assertCanViewBusiness(user, businessId);
    const row = await this.stats.completedOrders(businessId);
    return BusinessOwnerStatsMapper.toCompletedOrdersDto(businessId, row);
  }

  /**
   * `GET /businesses/:businessId/stats/sales?from=&to=`.
   *
   * The window is REQUIRED, validated as two instants with explicit offsets, and
   * ordered by the schema (`BusinessSalesStatsQuerySchema`). There is no default
   * because the SQL has no "all time" branch: a default would have to be invented
   * here, and an invented default is a report that quietly answers a different
   * question than the one that was asked. `to` is inclusive, matching the
   * function's `<=`, so a client can pass the exact end of a day and have that
   * day's last order counted.
   *
   * The window is echoed in the response next to the numbers. A caller that
   * rounds its own dates before sending would otherwise have no way to tell which
   * window produced the series, and the two would disagree forever.
   */
  async getSalesStats(
    user: AuthUser,
    businessId: string,
    query: BusinessSalesStatsQuery,
  ): Promise<BusinessSalesStatsResponseDto> {
    await this.businesses.assertCanViewBusiness(user, businessId);
    const row = await this.stats.sales(businessId, {
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return {
      period: { from: query.from, to: query.to },
      stats: BusinessOwnerStatsMapper.toSalesStatsDto(businessId, row),
    };
  }
}
