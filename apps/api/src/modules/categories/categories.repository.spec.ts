import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { CategoriesRepository } from './categories.repository';

let ctx: TestDbContext;
let repo: CategoriesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new CategoriesRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('CategoriesRepository (DB real)', () => {
  test('insert + findById', async () => {
    const row = await repo.insert(ctx.db, {
      name: 'Panadería',
      slug: 'panaderia',
    });
    expect(row.id).toBeDefined();
    expect(await repo.findById(row.id)).toMatchObject({ name: 'Panadería' });
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('findByName y findBySlug respetan excludeId', async () => {
    const a = await repo.insert(ctx.db, { name: 'Café', slug: 'cafe' });
    expect(await repo.findByName('Café')).toMatchObject({ id: a.id });
    expect(
      await repo.findByName('Café', { excludeId: a.id }),
    ).toBeNull();
    expect(await repo.findBySlug('cafe')).toMatchObject({ id: a.id });
    expect(await repo.findBySlug('cafe', { excludeId: a.id })).toBeNull();
    expect(await repo.findBySlug('no-existe')).toBeNull();
  });

  test('list filtra por active/search y pagina', async () => {
    await repo.insert(ctx.db, { name: 'Frutería', slug: 'fruteria', active: false });
    const all = await repo.list({ page: 1, limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(3);

    const active = await repo.list({ page: 1, limit: 10, active: true });
    expect(active.rows.every((r) => r.active)).toBe(true);

    const search = await repo.list({ page: 1, limit: 10, search: 'frut' });
    expect(search.rows.map((r) => r.name)).toContain('Frutería');

    const page = await repo.list({ page: 2, limit: 2 });
    expect(page.rows.length).toBeLessThanOrEqual(2);
  });

  test('update y softDelete', async () => {
    const row = await repo.insert(ctx.db, { name: 'Borrar', slug: 'borrar' });
    const updated = await repo.update(ctx.db, row.id, { name: 'Borrado' });
    expect(updated?.name).toBe('Borrado');

    const deleted = await repo.softDelete(ctx.db, row.id);
    expect(deleted?.deleted_at).toBeInstanceOf(Date);
    expect(await repo.findById(row.id)).toBeNull();
    expect(await repo.softDelete(ctx.db, row.id)).toBeNull();
  });

  test('transaction comparte conexión', async () => {
    const row = await repo.transaction((tx) =>
      repo.insert(tx, { name: 'Tx', slug: 'tx' }),
    );
    expect(await repo.findByName('Tx')).toMatchObject({ id: row.id });
  });
});
