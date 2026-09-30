import { BadRequestException } from '@nestjs/common';
import {
  REVENUE_PERIOD_DEFAULT_DAYS,
  RevenueStatsService,
  resolveRevenuePeriod,
} from './revenue-stats.service';
import type { RevenueStatsRepository } from './revenue-stats.repository';

const NOW = new Date('2026-09-26T12:00:00.000Z');

/** Aggregates vacíos: el service solo tiene que delegar y mapear. */
const emptyRow = {
  total_orders: 0,
  completed_orders: 0,
  cancelled_orders: 0,
  expired_orders: 0,
  gross_amount: '0',
  platform_fees: '0',
  business_net: '0',
};

const emptyCollected = {
  gross_amount: '0',
  platform_fees: '0',
  business_net: '0',
  paid_payouts: 0,
  outstanding_business_net: '0',
  outstanding_payouts: 0,
  failed_payouts: 0,
};

describe('resolveRevenuePeriod', () => {
  it('respeta el rango pedido', () => {
    expect(
      resolveRevenuePeriod({ from: '2026-01-01', to: '2026-01-31' }, NOW),
    ).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('por defecto toma los últimos 30 días contando hoy', () => {
    expect(resolveRevenuePeriod({}, NOW)).toEqual({
      from: '2026-08-28',
      to: '2026-09-26',
    });
    expect(REVENUE_PERIOD_DEFAULT_DAYS).toBe(30);
  });

  it('completa solo el borde que falta', () => {
    expect(resolveRevenuePeriod({ from: '2026-09-01' }, NOW).to).toBe(
      '2026-09-26',
    );
    expect(resolveRevenuePeriod({ to: '2026-09-10' }, NOW).from).toBe(
      '2026-08-12',
    );
  });

  it('acepta un rango inclusivo de un solo día', () => {
    expect(
      resolveRevenuePeriod({ from: '2026-09-26', to: '2026-09-26' }, NOW),
    ).toEqual({ from: '2026-09-26', to: '2026-09-26' });
  });

  it('rechaza un período invertido', () => {
    expect(() =>
      resolveRevenuePeriod({ from: '2026-09-30', to: '2026-09-01' }, NOW),
    ).toThrow(BadRequestException);
  });

  it('rechaza un from futuro cuando to cae en hoy', () => {
    expect(() => resolveRevenuePeriod({ from: '2026-10-01' }, NOW)).toThrow(
      BadRequestException,
    );
  });
});

describe('RevenueStatsService', () => {
  let service: RevenueStatsService;
  let repo: {
    accrued: jest.Mock;
    collected: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      accrued: jest.fn().mockResolvedValue(emptyRow),
      collected: jest.fn().mockResolvedValue(emptyCollected),
    };
    service = new RevenueStatsService(
      repo as unknown as RevenueStatsRepository,
    );
  });

  it('pide los dos agregados con el mismo período resuelto', async () => {
    const dto = await service.getRevenueStats({ from: '2026-09-01' });

    expect(repo.accrued).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: dto.period.to,
    });
    expect(repo.collected).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: dto.period.to,
    });
  });

  it('devuelve accrued y collected sin mezclarlos', async () => {
    repo.accrued.mockResolvedValue({
      ...emptyRow,
      completed_orders: 2,
      gross_amount: '150.00',
      platform_fees: '20.00',
      business_net: '130.00',
    });
    repo.collected.mockResolvedValue({
      ...emptyCollected,
      gross_amount: '50.00',
      platform_fees: '10.00',
      business_net: '40.00',
      paid_payouts: 1,
    });

    const dto = await service.getRevenueStats({
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(dto.accrued.platform_fees).toBe(20);
    expect(dto.collected.platform_fees).toBe(10);
    expect(dto.period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});
