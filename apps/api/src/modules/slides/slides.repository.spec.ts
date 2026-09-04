import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { SlidesRepository } from './slides.repository';

let ctx: TestDbContext;
let repo: SlidesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new SlidesRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('SlidesRepository (DB real)', () => {
  test('insert + findById + findByTitle', async () => {
    const row = await repo.insert(ctx.db, {
      title: 'Bienvenido',
      caption: 'Hola',
      cta_label: 'Ver más',
      type: 'info',
      priority: 1,
      active: true,
    });
    expect(await repo.findById(row.id)).toMatchObject({ title: 'Bienvenido' });
    expect(await repo.findByTitle('Bienvenido')).toMatchObject({ id: row.id });
    expect(await repo.findByTitle('Otro')).toBeNull();
  });

  test('list filtra y pagina', async () => {
    await repo.insert(ctx.db, {
      title: 'Oculto',
      caption: 'x',
      cta_label: 'Ver',
      type: 'info',
      priority: 2,
      active: false,
    });
    const active = await repo.list({ page: 1, limit: 10, active: true });
    expect(active.rows.every((r) => r.active)).toBe(true);
    const search = await repo.list({ page: 1, limit: 10, search: 'bienv' });
    expect(search.rows.map((r) => r.title)).toContain('Bienvenido');
  });

  test('update y softDelete', async () => {
    const row = await repo.insert(ctx.db, {
      title: 'Tmp',
      caption: 'x',
      cta_label: 'Ver',
      type: 'info',
      priority: 3,
      active: true,
    });
    expect(await repo.update(ctx.db, row.id, { title: 'Tmp2' })).toMatchObject({
      title: 'Tmp2',
    });
    await repo.softDelete(ctx.db, row.id);
    expect(await repo.findById(row.id)).toBeNull();
  });
});
