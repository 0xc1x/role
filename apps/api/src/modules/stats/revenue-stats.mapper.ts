import type { RevenueStats } from '@0xc1x/role-commons';
import type {
  AccruedRevenueRow,
  CollectedRevenueRow,
  RevenuePeriod,
} from './revenue-stats.repository';

/**
 * `sum(numeric)` llega de Postgres como string (`'1500.00'`). El redondeo a
 * dinero ocurre acá y no en el repository: la fila es el agregado crudo, y
 * el DTO es el número que el panel suma y formatea.
 */
function money(value: string | null): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

/** La comisión se reporta con la escala de `commission_rate` (4 decimales). */
function rate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Agregados ↔ DTO del reporte de dinero.
 *
 * La separación devengado/cobrado se mantiene también acá: son dos objetos
 * distintos con fuentes distintas, nunca un total único que los mezcle.
 */
export class RevenueStatsMapper {
  static toDto(input: {
    period: RevenuePeriod;
    accrued: AccruedRevenueRow;
    collected: CollectedRevenueRow;
  }): RevenueStats {
    const { period, accrued, collected } = input;
    const gross = money(accrued.gross_amount);
    const fees = money(accrued.platform_fees);

    return {
      period: { from: period.from, to: period.to },
      accrued: {
        gross_amount: gross,
        platform_fees: fees,
        business_net: money(accrued.business_net),
        effective_commission_rate: gross > 0 ? rate(fees / gross) : 0,
        orders: {
          total: accrued.total_orders,
          completed: accrued.completed_orders,
          cancelled: accrued.cancelled_orders,
          expired: accrued.expired_orders,
        },
      },
      collected: {
        gross_amount: money(collected.gross_amount),
        platform_fees: money(collected.platform_fees),
        business_net: money(collected.business_net),
        paid_payouts: collected.paid_payouts,
        outstanding_business_net: money(collected.outstanding_business_net),
        outstanding_payouts: collected.outstanding_payouts,
        failed_payouts: collected.failed_payouts,
      },
    };
  }
}
