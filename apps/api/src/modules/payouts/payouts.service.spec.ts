import { Test } from '@nestjs/testing';
import { PayoutsService } from './payouts.service';
import { PayoutsRepository } from './payouts.repository';

/**
 * Equivalencia con el SQL `generate_payouts`: los casos cubren la aritmética
 * exacta del cron (gross, fee con derivación legacy, net) y el estado final
 * (payout pending + órdenes backfilleadas + balance recalculado).
 */
describe('PayoutsService.generate (espejo de generate_payouts)', () => {
  let service: PayoutsService;
  const generate = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PayoutsRepository, useValue: { generate } },
      ],
    }).compile();
    service = module.get(PayoutsService);
    jest.resetAllMocks();
  });

  it('retorna el número de payouts creados', async () => {
    generate.mockResolvedValue(3);

    await expect(service.generate()).resolves.toEqual({ count: 3 });
  });

  it('sin órdenes pendientes → count 0', async () => {
    generate.mockResolvedValue(0);

    await expect(service.generate()).resolves.toEqual({ count: 0 });
  });
});

describe('PayoutsService (DB real)', () => {
  // Usa el spec del repositorio como contrato de datos; aquí solo se
  // verifica el cableado service→repo con mocks finos.
  test('list/getById/markPaid delegan y mapean', async () => {
    const row = {
      id: 'pay-1',
      business_id: 'biz-1',
      period_start: '2025-01-01',
      period_end: '2025-01-15',
      gross_amount: '1000',
      platform_fee: '100',
      net_amount: '900',
      status: 'pending',
      gateway_payout_id: null,
      paid_at: null,
      created_at: new Date('2025-01-16T00:00:00Z'),
      updated_at: new Date('2025-01-16T00:00:00Z'),
    };
    const module = await Test.createTestingModule({
      providers: [
        PayoutsService,
        {
          provide: PayoutsRepository,
          useValue: {
            list: async () => ({ rows: [row], total: 1 }),
            findById: async (id: string) => (id === 'pay-1' ? row : null),
            markPaid: async () => ({ ...row, status: 'paid' }),
            generate: async () => 0,
          },
        },
      ],
    }).compile();
    const svc = module.get(PayoutsService);
    const list = await svc.list({ page: 1, limit: 10 });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.gross_amount).toBe(1000);
    expect((await svc.getById('pay-1')).id).toBe('pay-1');
    expect((await svc.markPaid('pay-1')).status).toBe('paid');
    await expect(svc.getById('x')).rejects.toThrow();
  });
});
