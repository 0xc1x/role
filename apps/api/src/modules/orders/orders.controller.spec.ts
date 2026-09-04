jest.mock('@0xc1x/role-commons', () => ({
  CreateOrderRequestSchema: {},
  ListBusinessOrdersQuerySchema: {},
  ListOrdersQuerySchema: {},
  UpdateOrderStatusSchema: {},
  ValidatePickupCodeSchema: {},
}));

import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../auth/auth.types';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: jest.Mocked<OrdersService>;
  const user: AuthUser = { id: 'user-1', role: 'user', email: 'u@x.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: {
            create: jest.fn(),
            listMine: jest.fn(),
            listForBusiness: jest.fn(),
            getById: jest.fn(),
            updateStatus: jest.fn(),
            cancelOrder: jest.fn(),
            validatePickupCode: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(OrdersController);
    service = module.get(OrdersService);
  });

  it('create delega con el usuario autenticado', () => {
    const body = { offer_id: 'of-1', quantity: 2 } as never;
    controller.create(user, body);
    expect(service.create).toHaveBeenCalledWith(user, body);
  });

  it('listMine pasa el query', () => {
    const query = { page: 1, limit: 10 } as never;
    controller.listMine(user, query);
    expect(service.listMine).toHaveBeenCalledWith(user, query);
  });

  it('listForBusiness pasa el query', () => {
    const query = { business_id: 'b-1', page: 1, limit: 10 } as never;
    controller.listForBusiness(user, query);
    expect(service.listForBusiness).toHaveBeenCalledWith(user, query);
  });

  it('getById delega por id', () => {
    controller.getById(user, 'ord-1');
    expect(service.getById).toHaveBeenCalledWith(user, 'ord-1');
  });

  it('updateStatus pasa usuario, id y body', () => {
    const body = { status: 'ready_for_pickup' } as never;
    controller.updateStatus(user, 'ord-1', body);
    expect(service.updateStatus).toHaveBeenCalledWith(user, 'ord-1', body);
  });

  it('cancel delega', () => {
    controller.cancel(user, 'ord-1');
    expect(service.cancelOrder).toHaveBeenCalledWith(user, 'ord-1');
  });

  it('validatePickup extrae el pickup_code del body', () => {
    controller.validatePickup(user, 'ord-1', { pickup_code: '4821' } as never);
    expect(service.validatePickupCode).toHaveBeenCalledWith(user, 'ord-1', '4821');
  });
});
