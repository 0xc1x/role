import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { AppStoreRepository } from './app-store.repository';

let ctx: TestDbContext;
let repo: AppStoreRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new AppStoreRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('AppStoreRepository (DB real)', () => {
  test('insert + findById', async () => {
    const row = await repo.insert({ namespace: 'jobs', value: { a: 1 } });
    expect(row.status).toBe('PENDIENTE');
    expect(await repo.findById(row.id)).toMatchObject({ namespace: 'jobs' });
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('updateStatus con y sin extra', async () => {
    const row = await repo.insert({ namespace: 'jobs', value: { a: 1 } });
    const updated = await repo.updateStatus(row.id, 'PROCESADO');
    expect(updated?.status).toBe('PROCESADO');
    const merged = await repo.updateStatus(row.id, 'ERROR', { error: 'x' });
    expect(merged?.value).toMatchObject({ a: 1, error: 'x' });
    expect(await repo.updateStatus('00000000-0000-0000-0000-000000000000', 'ERROR')).toBeNull();
  });

  test('list filtra y softDelete oculta', async () => {
    const row = await repo.insert({ namespace: 'tmp', value: {} });
    const all = await repo.list({ page: 1, limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(2);
    const ns = await repo.list({ page: 1, limit: 10, namespace: 'tmp' });
    expect(ns.rows.map((r) => r.id)).toContain(row.id);
    expect(await repo.softDelete(row.id)).toBe(true);
    expect(await repo.softDelete(row.id)).toBe(false);
    expect(await repo.findById(row.id)).toBeNull();
  });
});
