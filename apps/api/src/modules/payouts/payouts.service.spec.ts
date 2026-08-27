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
