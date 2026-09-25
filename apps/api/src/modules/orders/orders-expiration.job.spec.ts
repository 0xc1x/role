import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersExpirationJob } from './orders-expiration.job';
import { OrdersService } from './orders.service';

describe('OrdersExpirationJob', () => {
  let job: OrdersExpirationJob;
  let ordersService: jest.Mocked<Pick<OrdersService, 'expireStaleOrders'>>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersExpirationJob,
        {
          provide: OrdersService,
          useValue: { expireStaleOrders: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => true) },
        },
      ],
    }).compile();

    job = module.get(OrdersExpirationJob);
    ordersService = module.get(OrdersService);
    config = module.get(ConfigService);
  });

  it('dormido sin ENABLE_JOBS_ORDERS_EXPIRATION (el env debe activarlo en prod)', async () => {
    config.get.mockReturnValue(false);

    await job.handleExpireStaleOrders();

    expect(ordersService.expireStaleOrders).not.toHaveBeenCalled();
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

  it('no lanza el error del servicio y loggea solo campos seguros', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    ordersService.expireStaleOrders.mockRejectedValue(
      Object.assign(new Error('password=secret'), {
        name: 'DatabaseError',
        code: '08006',
      }),
    );

    await expect(job.handleExpireStaleOrders()).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith({
      event: 'orders_expiration_failed',
      errorType: 'DatabaseError',
      errorCode: '08006',
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret');
    logError.mockRestore();

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
