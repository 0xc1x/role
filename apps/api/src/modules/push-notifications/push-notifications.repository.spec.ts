import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  consumerNotificationPreferences,
  deviceTokens,
} from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { PushNotificationsRepository } from './push-notifications.repository';

let ctx: TestDbContext;
let repo: PushNotificationsRepository;
let userA: string;
let userB: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new PushNotificationsRepository(ctx.db);
  userA = await seedProfile(ctx.db);
  userB = await seedProfile(ctx.db);
  await ctx.db.insert(deviceTokens).values([
    { user_id: userA, token: 'tok-a', platform: 'android', is_active: true },
    { user_id: userB, token: 'tok-b', platform: 'ios', is_active: false },
  ]);
});

afterAll(async () => {
  await ctx.stop();
});

describe('PushNotificationsRepository (DB real)', () => {
  test('templates: insert/list/find/update/delete', async () => {
    const [tpl] = await repo.insertTemplate({
      name: 'Ofertas',
      title: 'T',
      body: 'B',
      data: {},
    });
    if (!tpl) throw new Error('sin template');
    expect(await repo.findTemplateById(tpl.id)).toMatchObject({ name: 'Ofertas' });
    expect(await repo.findTemplateById(randomUUID())).toBeNull();
    const listed = await repo.listTemplates({ page: 1, limit: 10 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    const search = await repo.listTemplates({ page: 1, limit: 10, search: 'ofer' });
    expect(search.rows.map((r) => r.name)).toContain('Ofertas');
    expect(await repo.updateTemplate(tpl.id, { title: 'T2' })).toMatchObject({
      title: 'T2',
    });
    expect(await repo.deleteTemplate(tpl.id)).toBe(true);
    expect(await repo.deleteTemplate(tpl.id)).toBe(true);
    const after = await repo.listTemplates({ page: 1, limit: 10, search: 'ofer' });
    expect(after.rows.map((r) => r.name)).not.toContain('Ofertas');
  });

  test('notifications: insert/list/find', async () => {
    const [n] = await repo.insertNotification({
      title: 'Promo',
      body: 'Ven',
      data: {},
    });
    if (!n) throw new Error('sin notificación');
    expect(await repo.findNotificationById(n.id)).toMatchObject({ title: 'Promo' });
    const listed = await repo.listNotifications({ page: 1, limit: 10 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
  });

  test('tokens: list/update/count/names/filtros', async () => {
    const android = await repo.listTokens({ page: 1, limit: 10, platform: 'android' });
    expect(android.rows.map((r) => r.token)).toContain('tok-a');
    const search = await repo.listTokens({ page: 1, limit: 10, search: 'tok-b' });
    expect(search.rows.map((r) => r.token)).toContain('tok-b');

    await repo.updateToken(
      android.rows.find((r) => r.token === 'tok-a')?.id as string,
      { is_active: false },
    );
    expect(await repo.countUsersWithActiveTokens([])).toBe(0);
    expect(await repo.countUsersWithActiveTokens([userA, userB])).toBe(0);

    expect(await repo.findProfileNames([])).toEqual([]);
    const names = await repo.findProfileNames([userA]);
    expect(names.map((n) => n.user_id)).toContain(userA);

    expect(await repo.filterPushEnabled([])).toEqual([]);
    expect(await repo.filterPushEnabled([userA])).toEqual([userA]);
    await ctx.db.insert(consumerNotificationPreferences).values({
      user_id: userA,
      push_enabled: false,
    });
    expect(await repo.filterPushEnabled([userA, userB])).toEqual([userB]);

    expect(await repo.filterExistingUsers([])).toEqual([]);
    expect(await repo.filterExistingUsers([userA, randomUUID()])).toEqual([userA]);
  });
});
