import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedProfile } from '../../../test/seed';
import { CommissionsService } from './commissions.service';
import { CommissionsRepository } from './commissions.repository';

let ctx: TestDbContext;
let service: CommissionsService;
let businessId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new CommissionsService(new CommissionsRepository(ctx.db));
  const owner = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, owner)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('CommissionsService (DB real)', () => {
  test('list/getById/update sin pagos pendientes', async () => {
    const list = await service.list({ page: 1, limit: 10 });
    expect(list.data.length).toBeGreaterThanOrEqual(1);
    expect(await service.getById(businessId)).toMatchObject({ id: businessId });
    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
    // numeric(5,4) en BD: máximo 9.9999 (0.2 = 20%).
    const updated = await service.update(businessId, { commission_rate: 0.2 });
    expect(updated.commission_rate).toBe(0.2);
  });

  test('update con pagos pendientes → Conflict', async () => {
    await ctx.db.execute(
      `insert into payouts (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status) values ('${businessId}', '2025-01-01', '2025-01-15', 100, 10, 90, 'pending')`,
    );
    await expect(
      service.update(businessId, { commission_rate: 25 }),
    ).rejects.toThrow();
  });
});
