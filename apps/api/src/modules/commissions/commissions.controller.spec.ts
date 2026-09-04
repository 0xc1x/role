jest.mock('@0xc1x/role-commons', () => ({
  ListCommissionsQuerySchema: {},
  UpdateCommissionSchema: {},
}));

import { Test } from '@nestjs/testing';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

describe('CommissionsController', () => {
  let controller: CommissionsController;
  let service: jest.Mocked<CommissionsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommissionsController],
      providers: [
        {
          provide: CommissionsService,
          useValue: { list: jest.fn(), getById: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(CommissionsController);
    service = module.get(CommissionsService);
  });

  it('list pasa el query', () => {
    const query = { page: 1, limit: 20 } as never;
    controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('getById delega', () => {
    controller.getById('com-1');
    expect(service.getById).toHaveBeenCalledWith('com-1');
  });

  it('update pasa id y body', () => {
    const body = { commission_rate: 0.12 } as never;
    controller.update('com-1', body);
    expect(service.update).toHaveBeenCalledWith('com-1', body);
  });
});
