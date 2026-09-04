import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { AppConfigRepository } from './app-config.repository';
import { AppConfigService } from './app-config.service';

let ctx: TestDbContext;
let service: AppConfigService;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new AppConfigService(new AppConfigRepository(ctx.db));
});

afterAll(async () => {
  await ctx.stop();
});

describe('AppConfigService (DB real)', () => {
  test('create/list/listPublic/update/remove', async () => {
    const created = await service.create({
      key: 'k1',
      value: 'v',
      value_type: 'string',
      category: 'general',
      label: 'L',
      description: null,
      is_public: true,
      active: true,
    });
    expect(created.key).toBe('k1');
    await expect(
      service.create({
        key: 'k1',
        value: 'v',
        value_type: 'string',
        category: 'general',
        label: 'L',
        description: null,
        is_public: true,
        active: true,
      }),
    ).rejects.toThrow();

    expect((await service.list({ page: 1, limit: 10 })).meta.total).toBeGreaterThanOrEqual(1);
    expect(await service.listPublic()).toHaveLength(1);

    expect((await service.update('k1', { label: 'N' })).label).toBe('N');
    await expect(service.update('nope', {})).rejects.toThrow();

    await service.remove('k1');
    await expect(service.remove('k1')).rejects.toThrow();
  });
});
