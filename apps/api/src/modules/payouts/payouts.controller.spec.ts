import { z } from 'zod';

jest.mock('@0xc1x/role-commons', () => {
  return { PayoutStatusSchema: z.string() };
});

import { Test } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

describe('PayoutsController', () => {
  let controller: PayoutsController;
  let service: jest.Mocked<Pick<PayoutsService, 'list' | 'getById' | 'generate' | 'markPaid'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        {
          provide: PayoutsService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
            generate: jest.fn(),
            markPaid: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PayoutsController);
    service = module.get(PayoutsService);
  });

  it('list pasa el query', () => {
    const query = { page: 1, limit: 20, status: 'pending' } as never;
    controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('getById delega', () => {
    controller.getById('pay-1');
    expect(service.getById).toHaveBeenCalledWith('pay-1');
  });

  it('generate dispara la generación', () => {
    controller.generate();
    expect(service.generate).toHaveBeenCalled();
  });

  it('markPaid delega', () => {
    controller.markPaid('pay-1');
    expect(service.markPaid).toHaveBeenCalledWith('pay-1');
  });
});
