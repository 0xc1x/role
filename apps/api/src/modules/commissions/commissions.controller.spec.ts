jest.mock('@0xc1x/role-commons', () => ({
  ListCommissionsQuerySchema: {},
  UpdateCommissionSchema: {},
}));

import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('CommissionsController', () => {
  let controller: CommissionsController;
  let service: jest.Mocked<CommissionsService>;
  let reflector: Reflector;

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
    reflector = module.get(Reflector);
  });

  it('las tarifas de negocio no son públicas (requieren admin)', () => {
    for (const handler of [
      controller.list,
      controller.getById,
      controller.update,
    ]) {
      const metadata = reflector.get(ROLES_KEY, handler);
      expect(metadata).toEqual(['admin']);
      expect(
        reflector.get(IS_PUBLIC_KEY, handler),
      ).toBeUndefined();
    }
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
