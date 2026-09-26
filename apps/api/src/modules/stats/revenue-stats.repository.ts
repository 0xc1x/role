import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  effectiveNetAmountSql,
  effectivePlatformFeeSql,
} from '../../database/order-earnings';
import { orders } from '../../database/schema/orders';
import { payouts } from '../../database/schema/payouts';

/** Período resuelto: días calendario `YYYY-MM-DD` en UTC, ambos inclusivos. */
export type RevenuePeriod = { from: string; to: string };

/** Agregado de `orders` (devengado). */
export type AccruedRevenueRow = {
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  expired_orders: number;
  /** `sum(numeric)` llega como string: el redondeo a dinero es del mapper. */
  gross_amount: string;
  platform_fees: string;
  business_net: string;
};

/** Agregado de `payouts` (cobrado, pendiente y fallido). */
export type CollectedRevenueRow = {
  gross_amount: string;
  platform_fees: string;
  business_net: string;
  paid_payouts: number;
  outstanding_business_net: string;
  outstanding_payouts: number;
  failed_payouts: number;
};

/** `count(*) filter (where ...)`; el cast a int evita el bigint→string. */
const countWhere = (condition: SQL) =>
  sql<number>`(count(*) filter (where ${condition}))::int`;

const COMPLETED = 'completed';
const CANCELLED = 'cancelled';
const EXPIRED = 'expired';
const PAID = 'paid';
const FAILED = 'failed';
/** Estados en los que el dinero aún no salió de la plataforma. */
const OPEN_PAYOUT_STATUSES = ['pending', 'processing'] as const;

/**
 * Agregados del reporte de dinero.
 *
 * DOS FUENTES, deliberadamente separadas: `accrued` se arma sobre `orders` y
 * `collected` sobre `payouts`. No hay una consulta que intente unificarlas,
 * porque no son el mismo hecho económico.
 */
@Injectable()
export class RevenueStatsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Devengado: órdenes creadas en el período, agregadas por estado.
   *
   * El filtro es una ventana semiabierta sobre `orders.created_at` con los
   * bordes calculados en el literal, no un `::date` sobre la columna: así la
   * condición es sargable y `idx_orders_created` queda disponible. A un 3% de
   * selectividad el planner igual elige seq scan paralelo, que es lo correcto.
   */
  async accrued(period: RevenuePeriod): Promise<AccruedRevenueRow> {
    const [row] = await this.db
      .select({
        total_orders: count(),
        completed_orders: countWhere(eq(orders.status, COMPLETED)),
        cancelled_orders: countWhere(eq(orders.status, CANCELLED)),
        expired_orders: countWhere(eq(orders.status, EXPIRED)),
        gross_amount: sql<string>`coalesce(sum(${orders.price}) filter (where ${eq(orders.status, COMPLETED)}), 0)`,
        platform_fees: sql<string>`coalesce(sum(${effectivePlatformFeeSql()}) filter (where ${eq(orders.status, COMPLETED)}), 0)`,
        business_net: sql<string>`coalesce(sum(${effectiveNetAmountSql()}) filter (where ${eq(orders.status, COMPLETED)}), 0)`,
      })
      .from(orders)
      .where(periodWindow(orders.created_at, period));

    return (
      row ?? {
        total_orders: 0,
        completed_orders: 0,
        cancelled_orders: 0,
        expired_orders: 0,
        gross_amount: '0',
        platform_fees: '0',
        business_net: '0',
      }
    );
  }

  /**
   * Cobrado: payouts pagados dentro del período, más lo que quedó abierto.
   *
   * `paid_at` es el eje de "cobrado" (cuándo salió el dinero); lo pendiente
   * y lo fallido no tienen `paid_at`, así que se cuentan por `created_at`: el
   * corte que los originó. Por eso el `WHERE` es la unión de las dos ventanas
   * — un payout cortado en junio y pagado en septiembre ES cobrado en
   * septiembre.
   */
  async collected(period: RevenuePeriod): Promise<CollectedRevenueRow> {
    // `and` con dos o más condiciones nunca da undefined; la firma lo permite.
    const createdInPeriod = periodWindow(payouts.created_at, period)!;
    const paidInPeriod = and(
      eq(payouts.status, PAID),
      gte(payouts.paid_at, utcStart(period.from)),
      lt(payouts.paid_at, utcEndExclusive(period.to)),
    )!;
    const openInPeriod = and(
      createdInPeriod,
      inArray(payouts.status, [...OPEN_PAYOUT_STATUSES]),
    )!;
    const failedInPeriod = and(
      createdInPeriod,
      eq(payouts.status, FAILED),
    )!;

    const [row] = await this.db
      .select({
        gross_amount: sql<string>`coalesce(sum(${payouts.gross_amount}) filter (where ${paidInPeriod}), 0)`,
        platform_fees: sql<string>`coalesce(sum(${payouts.platform_fee}) filter (where ${paidInPeriod}), 0)`,
        business_net: sql<string>`coalesce(sum(${payouts.net_amount}) filter (where ${paidInPeriod}), 0)`,
        paid_payouts: countWhere(paidInPeriod),
        outstanding_business_net: sql<string>`coalesce(sum(${payouts.net_amount}) filter (where ${openInPeriod}), 0)`,
        outstanding_payouts: countWhere(openInPeriod),
        failed_payouts: countWhere(failedInPeriod),
      })
      .from(payouts)
      .where(or(createdInPeriod, paidInPeriod));

    return (
      row ?? {
        gross_amount: '0',
        platform_fees: '0',
        business_net: '0',
        paid_payouts: 0,
        outstanding_business_net: '0',
        outstanding_payouts: 0,
        failed_payouts: 0,
      }
    );
  }
}

/**
 * `[from, to + 1 día)` en UTC.
 *
 * Los bordes se anclan a UTC de forma explícita (`at time zone 'utc'`) en vez
 * de comparar un `date` contra un `timestamptz`: Postgres resolvería ese cast
 * con el `TimeZone` de la sesión, y un reporte corrido en otra zona cortaría
 * los días corrido. El rango es de días UTC porque así lo documenta el
 * contrato, y el `::date` de cada borde mantiene la ventana indexable (no se
 * castea la columna).
 */
function periodWindow(
  column: AnyPgColumn,
  period: RevenuePeriod,
): SQL | undefined {
  return and(
    gte(column, utcStart(period.from)),
    lt(column, utcEndExclusive(period.to)),
  );
}

/** Medianoche UTC del día `YYYY-MM-DD`, como timestamptz. */
function utcStart(day: string) {
  return sql`(${day}::date::timestamp at time zone 'utc')`;
}

/** Medianoche UTC del día siguiente a `YYYY-MM-DD` (borde superior). */
function utcEndExclusive(day: string) {
  return sql`((${day}::date + 1)::timestamp at time zone 'utc')`;
}
