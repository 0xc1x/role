import { describe, expect, jest, test } from 'bun:test';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

type Processor = (job: { name: string; data: unknown }) => Promise<void>;
let lastProcessor: Processor | null = null;
const closed: string[] = [];

jest.mock('bullmq', () => ({
  Queue: jest.fn(function (this: unknown) {
    return { close: jest.fn(async () => undefined) };
  }),
  Worker: jest.fn(function (this: unknown, _name: string, processor: Processor) {
    lastProcessor = processor;
    return {
      on: jest.fn(),
      close: jest.fn(async () => {
        closed.push('worker');
      }),
    };
  }),
}));

import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

const withRedis = {
  provide: ConfigService,
  useValue: {
    get: (key: string) =>
      key === 'REDIS_URL' ? 'redis://localhost:6380' : undefined,
  },
};

describe('NotificationsService con BullMQ (mocks)', () => {
  test('onModuleInit crea Queue+Worker; destroy cierra', async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: {} },
        withRedis,
      ],
    }).compile();
    const svc = module.get(NotificationsService);
    await svc.onModuleInit();
    expect(lastProcessor).not.toBeNull();
    await svc.onModuleDestroy();
    expect(closed).toContain('worker');
  });

  test('el worker deriva jobs send-push a processSend', async () => {
    const findActiveTokens = jest.fn(async () => []);
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: { findActiveTokens, filterByConsumerPrefs: jest.fn(async (ids: string[]) => ids), isInQuietHours: jest.fn(async () => false) },
        },
        withRedis,
      ],
    }).compile();
    const svc = module.get(NotificationsService);
    await svc.onModuleInit();
    await lastProcessor?.({ name: 'send-push', data: { userIds: ['u1'], payload: { title: 'T', body: 'B' } } });
    expect(findActiveTokens).toHaveBeenCalledWith(['u1']);
    await svc.onModuleDestroy();
  });
});
