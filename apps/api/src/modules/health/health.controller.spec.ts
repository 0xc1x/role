import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.tokens';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const db = { execute: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DRIZZLE, useValue: db }],
    }).compile();

    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('returns ok when database is up', async () => {
    db.execute.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.timestamp).toBeDefined();
  });

  it('throws 503 when database is down', async () => {
    db.execute.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow(HttpException);
  });
});
