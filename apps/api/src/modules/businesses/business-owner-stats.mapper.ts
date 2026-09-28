import type {
  BusinessCompletedOrdersDto,
  BusinessSalesStatsDto,
  BusinessTopProductDto,
} from '@0xc1x/role-commons';
import type {
  CompletedOrdersRow,
  DailyStat,
  SalesStatsRow,
  TopProductStat,
} from './business-owner-stats.repository';

/**
 * `sum(numeric)` reaches the mapper as the string Postgres sends, and the
 * rounding to money happens here — the same split `RevenueStatsMapper` uses, and
 * for the same reason: the repository returns the raw aggregate and the DTO is
 * the number the panel sums and formats.
 */
function money(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

/**
 * The jsonb the aggregate builds, typed at the boundary.
 *
 * The cast is at the EDGE and it is a cast, not a parse: `jsonb_build_object`
 * inside Postgres already produced numbers for `sold`, `orders` and `revenue`
 * (the `count(*)` and the `numeric` sum are both jsonb numbers, not strings),
 * so the only work left here is to say so in the type system. The mapper then
 * reads `name` and `day` as the strings Postgres wrote and the counts as the
 * numbers Postgres wrote.
 */
function topProducts(value: unknown): BusinessTopProductDto[] {
  const rows = (value ?? []) as TopProductStat[];
  return rows.map((row) => ({
    name: row.name,
    sold: row.sold,
    revenue: money(row.revenue),
  }));
}

function daily(value: unknown): BusinessSalesStatsDto['daily'] {
  const rows = (value ?? []) as DailyStat[];
  return rows.map((row) => ({
    day: row.day,
    orders: row.orders,
    revenue: money(row.revenue),
  }));
}

/**
 * Aggregates → DTOs for the two owner-gated business stats.
 *
 * The `business_id` is echoed on both, from the PATH and never from the row's
 * own column: a client rendering several businesses in one screen has no other
 * way to keep the cards apart, and a value read back out of the aggregate could
 * only ever agree with the path anyway.
 */
export class BusinessOwnerStatsMapper {
  static toCompletedOrdersDto(
    businessId: string,
    row: CompletedOrdersRow,
  ): BusinessCompletedOrdersDto {
    return { business_id: businessId, completed_orders: row.completed_orders };
  }

  static toSalesStatsDto(
    businessId: string,
    row: SalesStatsRow,
  ): BusinessSalesStatsDto {
    return {
      business_id: businessId,
      orders_count: row.orders_count,
      revenue: money(row.revenue),
      // Order preserved as the SQL ordered it: `sold desc, first_seen asc`.
      // The tiebreak is not decoration — two products with the same sold count
      // would otherwise come back in whatever order the planner produced, and
      // the panel's "top 5" would reshuffle between reloads.
      top_products: topProducts(row.top_products),
      daily: daily(row.daily),
    };
  }
}
