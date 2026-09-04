import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  consumerNotificationPreferences,
  deviceTokens,
} from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { NotificationsRepository } from './notifications.repository';

let ctx: TestDbContext;
let repo: NotificationsRepository;
let userA: string;
let userB: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new NotificationsRepository(ctx.db);
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

describe('NotificationsRepository (DB real)', () => {
  test('findActiveTokens solo activos', async () => {
    expect(await repo.findActiveTokens([])).toEqual([]);
    const rows = await repo.findActiveTokens([userA, userB]);
    expect(rows.map((r) => r.token)).toEqual(['tok-a']);
  });

  test('deactivateToken apaga', async () => {
    await repo.deactivateToken('tok-a');
    expect(await repo.findActiveTokens([userA])).toEqual([]);
  });

  test('cleanupOldTokens borra inactivos viejos', async () => {
    const old = randomUUID();
    await ctx.db.insert(deviceTokens).values({
      user_id: userA,
      token: old,
      platform: 'web',
      is_active: false,
    });
    await ctx.db.execute(
      `update device_tokens set updated_at = now() - interval '100 days' where token = '${old}'`,
    );
    expect(await repo.cleanupOldTokens()).toBeGreaterThanOrEqual(1);
    expect(await repo.findActiveTokens([userA, userB])).toEqual([]);
  });

  test('filterByConsumerPrefs: sin fila = permitido', async () => {
    expect(
      await repo.filterByConsumerPrefs([userA, userB], 'pickup_reminders_enabled'),
    ).toEqual([userA, userB]);
    await ctx.db.insert(consumerNotificationPreferences).values({
      user_id: userB,
      pickup_reminders_enabled: false,
    });
    expect(
      await repo.filterByConsumerPrefs([userA, userB], 'pickup_reminders_enabled'),
    ).toEqual([userA]);
  });

  test('isInQuietHours falso sin preferencias', async () => {
    expect(await repo.isInQuietHours(userA)).toBe(false);
    await ctx.db
      .insert(consumerNotificationPreferences)
      .values({
        user_id: userA,
        quiet_hours_from: '00:00:00',
        quiet_hours_to: '23:59:59',
      })
      .onConflictDoNothing();
    expect(await repo.isInQuietHours(userA)).toBe(true);
  });
});
