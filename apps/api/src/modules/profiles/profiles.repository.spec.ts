import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deviceTokens, profiles } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { ProfilesRepository } from './profiles.repository';

let ctx: TestDbContext;
let repo: ProfilesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new ProfilesRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

async function seedProfile(email: string) {
  const id = randomUUID();
  await ctx.db.insert(profiles).values({ id, email });
  return id;
}

describe('ProfilesRepository (DB real)', () => {
  test('findById + update', async () => {
    const id = await seedProfile('a@b.cl');
    expect(await repo.findById(id)).toMatchObject({ email: 'a@b.cl' });
    expect(await repo.findById(randomUUID())).toBeNull();
    expect(
      await repo.update(id, { full_name: 'Ana', city: 'Santiago' }),
    ).toMatchObject({ full_name: 'Ana' });
    expect(await repo.update(randomUUID(), { full_name: 'x' })).toBeNull();
  });

  test('hasActivePushToken filtra por tokens activos', async () => {
    const withToken = await seedProfile('con@token.cl');
    const withoutToken = await seedProfile('sin@token.cl');
    const withInactive = await seedProfile('inactivo@token.cl');
    await ctx.db.insert(deviceTokens).values({
      user_id: withToken,
      token: 'tok-activo',
      platform: 'android',
      is_active: true,
    });
    await ctx.db.insert(deviceTokens).values({
      user_id: withInactive,
      token: 'tok-inactivo',
      platform: 'ios',
      is_active: false,
    });

    const withRes = await repo.list({ page: 1, limit: 50, hasActivePushToken: true });
    const ids = withRes.rows.map((r) => r.id);
    expect(ids).toContain(withToken);
    expect(ids).not.toContain(withoutToken);
    expect(ids).not.toContain(withInactive);

    const withoutRes = await repo.list({
      page: 1,
      limit: 50,
      hasActivePushToken: false,
    });
    expect(withoutRes.rows.map((r) => r.id)).toContain(withoutToken);
    expect(withoutRes.rows.map((r) => r.id)).not.toContain(withToken);
  });

  test('list pagina y busca', async () => {
    const res = await repo.list({ page: 1, limit: 2 });
    expect(res.rows.length).toBeLessThanOrEqual(2);
    expect(res.total).toBeGreaterThanOrEqual(4);
    const search = await repo.list({ page: 1, limit: 10, search: 'con@token' });
    expect(search.rows.map((r) => r.email)).toContain('con@token.cl');
  });

  test('insertRegistrationDefaults es idempotente', async () => {
    const id = await seedProfile('prefs@x.cl');
    await repo.insertRegistrationDefaults(id);
    await repo.insertRegistrationDefaults(id);
  });
});
