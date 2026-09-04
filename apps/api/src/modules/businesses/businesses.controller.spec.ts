jest.mock('@0xc1x/role-commons', () => ({
  CreateBusinessSchema: {},
  UpdateBusinessSchema: {},
  ListBusinessesQuerySchema: {},
  CreateBusinessLocationSchema: {},
  UpdateBusinessLocationSchema: {},
  ListBusinessLocationsQuerySchema: {},
}));

import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';

describe('BusinessesController', () => {
  let controller: BusinessesController;
  let service: jest.Mocked<BusinessesService>;
  const user: AuthUser = { id: 'user-1', role: 'business', email: 'u@x.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessesController],
      providers: [
        {
          provide: BusinessesService,
          useValue: {
            list: jest.fn(),
            create: jest.fn(),
            getById: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            listLocations: jest.fn(),
            getLocation: jest.fn(),
            createLocation: jest.fn(),
            updateLocation: jest.fn(),
            removeLocation: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BusinessesController);
    service = module.get(BusinessesService);
  });

  it('list/create/getById/update/remove delegan con usuario', () => {
    const query = { page: 1, limit: 10 } as never;
    const body = { name: 'Café', slug: 'cafe' } as never;

    controller.list(user, query);
    controller.create(user, body);
    controller.getById(user, 'biz-1');
    controller.update(user, 'biz-1', body);
    controller.remove(user, 'biz-1');

    expect(service.list).toHaveBeenCalledWith(user, query);
    expect(service.create).toHaveBeenCalledWith(user, body);
    expect(service.getById).toHaveBeenCalledWith(user, 'biz-1');
    expect(service.update).toHaveBeenCalledWith(user, 'biz-1', body);
    expect(service.remove).toHaveBeenCalledWith(user, 'biz-1');
  });

  it('locations: CRUD delega con businessId y locationId correctos', () => {
    const query = { page: 1, limit: 10 } as never;
    const body = { name: 'Sucursal', address: 'Calle 1', latitude: 0, longitude: 0 } as never;

    controller.listLocations(user, 'biz-1', query);
    controller.getLocation(user, 'biz-1', 'loc-1');
    controller.createLocation(user, 'biz-1', body);
    controller.updateLocation(user, 'biz-1', 'loc-1', body);
    controller.removeLocation(user, 'biz-1', 'loc-1');

    expect(service.listLocations).toHaveBeenCalledWith(user, 'biz-1', query);
    expect(service.getLocation).toHaveBeenCalledWith(user, 'biz-1', 'loc-1');
    expect(service.createLocation).toHaveBeenCalledWith(user, 'biz-1', body);
    expect(service.updateLocation).toHaveBeenCalledWith(user, 'biz-1', 'loc-1', body);
    expect(service.removeLocation).toHaveBeenCalledWith(user, 'biz-1', 'loc-1');
  });
});
