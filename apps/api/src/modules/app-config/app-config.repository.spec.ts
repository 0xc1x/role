import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { AppConfigRepository } from './app-config.repository';

let ctx: TestDbContext;
let repo: AppConfigRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new AppConfigRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

const base = {
  value: 'v1',
  value_type: 'string',
  category: 'general',
  label: 'Clave',
  description: null,
  is_public: true,
  active: true,
} as const;

describe('AppConfigRepository (DB real)', () => {
  test('insert + findByKey', async () => {
    await repo.insert(ctx.db, { key: 'k1', ...base });
    expect(await repo.findByKey('k1')).toMatchObject({ label: 'Clave' });
    expect(await repo.findByKey('nope')).toBeNull();
  });

  test('listPublic solo activas y públicas', async () => {
    await repo.insert(ctx.db, { key: 'priv', ...base, is_public: false });
    await repo.insert(ctx.db, { key: 'off', ...base, active: false });
    const rows = await repo.listPublic();
    expect(rows.map((r) => r.key)).toContain('k1');
    expect(rows.map((r) => r.key)).not.toContain('priv');
    expect(rows.map((r) => r.key)).not.toContain('off');
  });

  test('list filtra por active/category/search', async () => {
    const all = await repo.list({ page: 1, limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(3);
    const cat = await repo.list({ page: 1, limit: 10, category: 'general' });
    expect(cat.rows.every((r) => r.category === 'general')).toBe(true);
    const search = await repo.list({ page: 1, limit: 10, search: 'clav' });
    expect(search.rows.map((r) => r.key)).toContain('k1');
    const inactive = await repo.list({ page: 1, limit: 10, active: false });
    expect(inactive.rows.map((r) => r.key)).toContain('off');
  });

  test('update y remove', async () => {
    expect(await repo.update(ctx.db, 'k1', { label: 'Nueva' })).toMatchObject({
      label: 'Nueva',
    });
    expect(await repo.update(ctx.db, 'nope', { label: 'x' })).toBeNull();
    expect(await repo.remove('k1')).toBe(true);
    expect(await repo.remove('k1')).toBe(false);
  });
});
