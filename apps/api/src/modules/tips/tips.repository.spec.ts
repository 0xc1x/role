import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { TipsRepository } from './tips.repository';

let ctx: TestDbContext;
let repo: TipsRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new TipsRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('TipsRepository (DB real)', () => {
  test('insert + findById', async () => {
    const row = await repo.insert(ctx.db, { content: 'Compra local' });
    expect(row.active).toBe(true);
    expect(await repo.findById(row.id)).toMatchObject({
      content: 'Compra local',
    });
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('findRandom solo activos no borrados', async () => {
    await repo.insert(ctx.db, { content: 'Solo activo', active: true });
    await repo.insert(ctx.db, { content: 'Inactivo', active: false });
    for (let i = 0; i < 5; i++) {
      const row = await repo.findRandom();
      expect(row?.active).toBe(true);
    }
  });

  test('list filtra y pagina', async () => {
    const res = await repo.list({ page: 1, limit: 10, search: 'activo' });
    expect(res.total).toBeGreaterThanOrEqual(1);
    const inactive = await repo.list({ page: 1, limit: 10, active: false });
    expect(inactive.rows.every((r) => !r.active)).toBe(true);
  });

  test('update y softDelete', async () => {
    const row = await repo.insert(ctx.db, { content: 'Tmp' });
    expect(await repo.update(ctx.db, row.id, { content: 'Tmp2' })).toMatchObject(
      { content: 'Tmp2' },
    );
    await repo.softDelete(ctx.db, row.id);
    expect(await repo.findById(row.id)).toBeNull();
  });
});
