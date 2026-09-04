import { Test } from '@nestjs/testing';
import { OrdersExpirationJob } from './orders-expiration.job';
import { OrdersService } from './orders.service';

describe('OrdersExpirationJob', () => {
  let job: OrdersExpirationJob;
  let ordersService: jest.Mocked<Pick<OrdersService, 'expireStaleOrders'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersExpirationJob,
        {
          provide: OrdersService,
          useValue: { expireStaleOrders: jest.fn() },
        },
      ],
    }).compile();

    job = module.get(OrdersExpirationJob);
    ordersService = module.get(OrdersService);
  });

  it('expira órdenes vencidas y reporta el conteo', async () => {
    ordersService.expireStaleOrders.mockResolvedValue({ expired: 3 });

    await job.handleExpireStaleOrders();

    expect(ordersService.expireStaleOrders).toHaveBeenCalledTimes(1);
  });

  it('con 0 expiradas no falla', async () => {
    ordersService.expireStaleOrders.mockResolvedValue({ expired: 0 });
    await expect(job.handleExpireStaleOrders()).resolves.toBeUndefined();
  });

  it('no lanza el error del servicio (lo loggea) y libera el flag', async () => {
    ordersService.expireStaleOrders.mockRejectedValue(new Error('db down'));

    await expect(job.handleExpireStaleOrders()).resolves.toBeUndefined();

    // El flag anti-reentrada quedó libre: el siguiente tick sí ejecuta.
    ordersService.expireStaleOrders.mockResolvedValue({ expired: 1 });
    await job.handleExpireStaleOrders();
    expect(ordersService.expireStaleOrders).toHaveBeenCalledTimes(2);
  });

  it('salta el tick cuando ya hay una ejecución en curso', async () => {
    let release!: () => void;
    ordersService.expireStaleOrders.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ expired: 0 });
        }),
    );

    const first = job.handleExpireStaleOrders();
    await job.handleExpireStaleOrders(); // tick solapado: debe saltarse

    expect(ordersService.expireStaleOrders).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
