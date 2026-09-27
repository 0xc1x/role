jest.mock('@0xc1x/role-commons', () => ({
  CreateOrderRequestSchema: {},
  ListAdminOrdersQuerySchema: {},
  ListBusinessOrdersQuerySchema: {},
  ListOrderEventsQuerySchema: {},
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
            listForAdmin: jest.fn(),
            getById: jest.fn(),
            listEvents: jest.fn(),
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

  it('create delega con el usuario autenticado', async () => {
    const body = { offer_id: 'of-1', quantity: 2 } as never;
    const order = { id: 'order-1' } as never;
    service.create.mockResolvedValue({ order, replayed: false });
    const res = { status: jest.fn() } as never;

    await controller.create(user, body, res);

    expect(service.create).toHaveBeenCalledWith(user, body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('create responde 200 y la MISMA orden cuando es un replay', async () => {
    // The replay is the whole point of the key: the caller must get its
    // original order back, and the only observable difference is the status.
    const body = { offer_id: 'of-1', idempotency_key: 'k-1' } as never;
    const order = { id: 'order-1' } as never;
    service.create.mockResolvedValue({ order, replayed: true });
    const res = { status: jest.fn() } as never;

    const returned = await controller.create(user, body, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(returned).toBe(order);
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

  it('listForAdmin pasa el query', () => {
    const query = {
      status: 'pending',
      stuck: true,
      page: 1,
      limit: 10,
    } as never;
    controller.listForAdmin(query);
    expect(service.listForAdmin).toHaveBeenCalledWith(query);
  });

  it('getById delega por id', () => {
    controller.getById(user, 'ord-1');
    expect(service.getById).toHaveBeenCalledWith(user, 'ord-1');
  });

  it('listEvents pasa usuario, id y query', () => {
    const query = { page: 1, limit: 20 } as never;
    controller.listEvents(user, 'ord-1', query);
    expect(service.listEvents).toHaveBeenCalledWith(user, 'ord-1', query);
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
    expect(service.validatePickupCode).toHaveBeenCalledWith(
      user,
      'ord-1',
      '4821',
    );
  });
});
