import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';

function createStorage(redisUrl = '') {
  const config = {
    get: jest.fn((key: string) => (key === 'REDIS_URL' ? redisUrl : '')),
  } as unknown as ConfigService<never, true>;
  return new RedisThrottlerStorage(config);
}

describe('RedisThrottlerStorage', () => {
  test('uses the explicit in-memory fallback only without REDIS_URL', async () => {
    const storage = createStorage();

    expect(await storage.check()).toEqual({ backend: 'memory', status: 'up' });
    await expect(
      storage.increment('client-key', 60_000, 2, 10_000, 'contact'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });

  test('enforces limits and blocks repeated keys without exposing them', async () => {
    const storage = createStorage();

    await storage.increment('private-client-key', 60_000, 2, 10_000, 'contact');
    await storage.increment('private-client-key', 60_000, 2, 10_000, 'contact');
    const blocked = await storage.increment(
      'private-client-key',
      60_000,
      2,
      10_000,
      'contact',
    );

    expect(blocked).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(JSON.stringify(blocked)).not.toContain('private-client-key');
  });

  test('keeps separate counters for separate named throttlers', async () => {
    const storage = createStorage();

    await storage.increment('same-client', 60_000, 1, 0, 'contact');
    const other = await storage.increment('same-client', 60_000, 1, 0, 'auth');

    expect(other).toMatchObject({ totalHits: 1, isBlocked: false });
  });
});
