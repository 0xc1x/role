import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  RedisThrottlerStorage,
  type RateLimitHealth,
} from '../../common/rate-limit/redis-throttler.storage';
import { DRIZZLE } from '../../database/database.tokens';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const db = { execute: jest.fn() };
  const rateLimitStorage = {
    check: jest.fn(async (): Promise<RateLimitHealth> => ({
      backend: 'redis',
      status: 'up',
    })),
  };
  const configValues: Record<string, unknown> = {
    NODE_ENV: 'production',
    RENDER_GIT_COMMIT: 'release-sha',
    ENABLE_JOBS_ORDERS_EXPIRATION: true,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: RedisThrottlerStorage, useValue: rateLimitStorage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('returns ok when database is up', async () => {
    db.execute.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check();

    expect(result).toMatchObject({
      status: 'ok',
      version: 'release-sha',
      database: 'up',
      rateLimit: { backend: 'redis', status: 'up' },
      jobs: {
        ordersExpiration: { enabled: true, intervalSeconds: 60 },
      },
    });
    expect(result.timestamp).toBeDefined();
  });

  it('returns 503 when Redis rate limiting is down', async () => {
    db.execute.mockResolvedValue([{ '?column?': 1 }]);
    rateLimitStorage.check.mockResolvedValueOnce({
      backend: 'redis',
      status: 'down',
    });

    await expect(controller.check()).rejects.toThrow(HttpException);
  });

  it('does not report production healthy with in-memory rate limiting', async () => {
    db.execute.mockResolvedValue([{ '?column?': 1 }]);
    rateLimitStorage.check.mockResolvedValueOnce({
      backend: 'memory',
      status: 'up',
    });

    await expect(controller.check()).rejects.toThrow(HttpException);
  });

  it('throws 503 when database is down', async () => {
    db.execute.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow(HttpException);
  });
});
