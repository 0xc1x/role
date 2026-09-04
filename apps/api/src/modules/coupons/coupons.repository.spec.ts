import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { CouponsRepository } from './coupons.repository';

let ctx: TestDbContext;
let repo: CouponsRepository;
let businessId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new CouponsRepository(ctx.db);
  const owner = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, owner)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('CouponsRepository (DB real)', () => {
  test('insert + findById + findGlobalByCode', async () => {
    const row = await repo.insert(ctx.db, {
      code: 'DESC10',
      name: 'Descuento',
      type: 'percentage',
      value: '10',
    });
    expect(await repo.findById(row.id)).toMatchObject({ code: 'DESC10' });
    expect(await repo.findGlobalByCode('DESC10')).toMatchObject({ id: row.id });
    expect(await repo.findGlobalByCode('DESC10', { excludeId: row.id })).toBeNull();
    expect(await repo.findGlobalByCode('NOPE')).toBeNull();
  });

  test('global true/false discrimina por business_id', async () => {
    await repo.insert(ctx.db, {
      business_id: businessId,
      code: 'BIZ5',
      name: 'Negocio',
      type: 'fixed',
      value: '500',
    });
    const global = await repo.list({ page: 1, limit: 10, global: true });
    expect(global.rows.every((r) => r.business_id === null)).toBe(true);
    const biz = await repo.list({ page: 1, limit: 10, global: false });
    expect(biz.rows.map((r) => r.code)).toContain('BIZ5');
  });

  test('list filtra por activo y búsqueda', async () => {
    await repo.insert(ctx.db, {
      code: 'OFF1',
      name: 'Apagado',
      type: 'fixed',
      value: '100',
      is_active: false,
    });
    const active = await repo.list({ page: 1, limit: 10, is_active: true });
    expect(active.rows.every((r) => r.is_active)).toBe(true);
    const search = await repo.list({ page: 1, limit: 10, search: 'desc10' });
    expect(search.rows.map((r) => r.code)).toContain('DESC10');
  });

  test('update y remove', async () => {
    const row = await repo.insert(ctx.db, {
      code: 'TMP',
      name: 'T',
      type: 'fixed',
      value: '1',
    });
    expect(await repo.update(ctx.db, row.id, { name: 'T2' })).toMatchObject({
      name: 'T2',
    });
    expect(await repo.remove(ctx.db, row.id)).toMatchObject({ code: 'TMP' });
    expect(await repo.findById(row.id)).toBeNull();
  });
});
