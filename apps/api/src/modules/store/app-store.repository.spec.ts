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
    expect(row.delivery_status).toBe('PENDIENTE');
    expect(await repo.findById(row.id)).toMatchObject({ namespace: 'jobs' });
    expect(
      await repo.findById('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });

  test('updateDeliveryStatus con y sin extra', async () => {
    const row = await repo.insert({ namespace: 'jobs', value: { a: 1 } });
    const updated = await repo.updateDeliveryStatus(row.id, 'PROCESADO');
    expect(updated?.delivery_status).toBe('PROCESADO');
    const merged = await repo.updateDeliveryStatus(row.id, 'ERROR', {
      error: 'x',
    });
    expect(merged?.value).toMatchObject({ a: 1, error: 'x' });
    expect(
      await repo.updateDeliveryStatus(
        '00000000-0000-0000-0000-000000000000',
        'ERROR',
      ),
    ).toBeNull();
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

  test('el filtro por delivery_status trae solo las filas en ese eje', async () => {
    await repo.insert({ namespace: 'jobs', value: { a: 1 } });
    const procesado = await repo.insert({
      namespace: 'jobs',
      value: { a: 2 },
      delivery_status: 'PROCESADO',
    });

    const { rows } = await repo.list({
      namespace: 'jobs',
      delivery_status: 'PROCESADO',
      page: 1,
      limit: 20,
    });

    expect(rows.map((r) => r.id)).toEqual([procesado.id]);
  });

  test('el filtro por state trae solo las filas en ese estado', async () => {
    await repo.insert({
      namespace: 'bug_report',
      value: { a: 1 },
      state: 'ABIERTO',
    });
    await repo.insert({
      namespace: 'bug_report',
      value: { a: 2 },
      state: 'CORREGIDO',
    });

    const { rows } = await repo.list({
      namespace: 'bug_report',
      state: 'ABIERTO',
      page: 1,
      limit: 20,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('ABIERTO');
  });

  test('updateState mueve el triaje sin tocar la entrega', async () => {
    const row = await repo.insert({
      namespace: 'bug_report',
      value: { a: 1 },
      origin: 'ios',
      state: 'ABIERTO',
    });

    const triaged = await repo.updateState(row.id, 'CORREGIDO');

    expect(triaged?.state).toBe('CORREGIDO');
    // El eje de entrega es otro: el triaje no lo mueve.
    expect(triaged?.delivery_status).toBe('PENDIENTE');
    expect(triaged?.value).toMatchObject({ a: 1 });
    expect(
      await repo.updateState(
        '00000000-0000-0000-0000-000000000000',
        'DUPLICADO',
      ),
    ).toBeNull();
  });
});
