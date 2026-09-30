import { RevenueStatsMapper } from './revenue-stats.mapper';
import type {
  AccruedRevenueRow,
  CollectedRevenueRow,
} from './revenue-stats.repository';

const period = { from: '2026-09-01', to: '2026-09-30' };

const accrued: AccruedRevenueRow = {
  total_orders: 4,
  completed_orders: 2,
  cancelled_orders: 1,
  expired_orders: 1,
  gross_amount: '150.00',
  platform_fees: '20.00',
  business_net: '130.00',
};

const collected: CollectedRevenueRow = {
  gross_amount: '50.00',
  platform_fees: '10.00',
  business_net: '40.00',
  paid_payouts: 1,
  outstanding_business_net: '90.00',
  outstanding_payouts: 1,
  failed_payouts: 0,
};

describe('RevenueStatsMapper', () => {
  it('convierte los string de numeric en números y redondea a 2 decimales', () => {
    const dto = RevenueStatsMapper.toDto({
      period,
      accrued: { ...accrued, gross_amount: '150.005' },
      collected,
    });

    expect(dto.accrued.gross_amount).toBe(150.01);
    expect(dto.collected.business_net).toBe(40);
    expect(typeof dto.accrued.gross_amount).toBe('number');
  });

  it('calcula la comisión efectiva como fracción de platform_fees sobre gross', () => {
    const dto = RevenueStatsMapper.toDto({ period, accrued, collected });

    expect(dto.accrued.effective_commission_rate).toBe(0.1333);
  });

  it('devuelve comisión 0 cuando no hubo volumen, sin dividir por cero', () => {
    const dto = RevenueStatsMapper.toDto({
      period,
      accrued: {
        ...accrued,
        gross_amount: '0',
        platform_fees: '0',
        business_net: '0',
        completed_orders: 0,
      },
      collected: { ...collected, gross_amount: '0' },
    });

    expect(dto.accrued.effective_commission_rate).toBe(0);
  });

  it('mantiene devengado y cobrado en objetos distintos', () => {
    const dto = RevenueStatsMapper.toDto({ period, accrued, collected });

    expect(dto.accrued).not.toBe(dto.collected);
    expect(dto.accrued.platform_fees).toBe(20);
    expect(dto.collected.platform_fees).toBe(10);
    // El neto pendiente es de la cara cobrada, no de la devengada.
    expect(dto.collected.outstanding_business_net).toBe(90);
    expect(dto.accrued).not.toHaveProperty('outstanding_business_net');
    expect(dto.accrued).not.toHaveProperty('paid_payouts');
  });

  it('devuelve el período resuelto tal cual', () => {
    const dto = RevenueStatsMapper.toDto({ period, accrued, collected });
    expect(dto.period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('tolera nulos defensivos sin romper el DTO', () => {
    const dto = RevenueStatsMapper.toDto({
      period,
      accrued: { ...accrued, gross_amount: null as never },
      collected,
    });

    expect(dto.accrued.gross_amount).toBe(0);
    expect(dto.accrued.effective_commission_rate).toBe(0);
  });
});
