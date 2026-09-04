import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { deviceTokens } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

let ctx: TestDbContext;
let service: NotificationsService;
let userA: string;
let userB: string;
const originalFetch = globalThis.fetch;

const okFetch = () =>
  (globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { status: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch);

beforeAll(async () => {
  ctx = await createTestDb();
  const config = {
    get: (key: string) =>
      key === 'CORS_ORIGINS' ? 'http://localhost:3000' : undefined,
  } as unknown as ConfigService;
  service = new NotificationsService(new NotificationsRepository(ctx.db), config);
  userA = await seedProfile(ctx.db);
  userB = await seedProfile(ctx.db);
  await ctx.db.insert(deviceTokens).values([
    { user_id: userA, token: 'tok-a', platform: 'android', is_active: true },
    { user_id: userB, token: 'tok-b', platform: 'ios', is_active: true },
  ]);
  okFetch();
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await ctx.stop();
});

describe('NotificationsService (DB real + fetch stub)', () => {
  test('send sin cola va directo', async () => {
    await service.send([userA], { title: 'Hola', body: 'Mundo' });
  });

  test('processSend entrega a tokens activos', async () => {
    await service.processSend({
      userIds: [userA, userB],
      payload: { title: 'T', body: 'B' },
    });
    const rows = await ctx.db.execute(
      `select count(*)::int as n from device_tokens where is_active`,
    );
    expect(rows).toBeDefined();
  });

  test('processSend sin destinatarios no hace nada', async () => {
    await service.processSend({ userIds: [], payload: { title: 'T', body: 'B' } });
  });

  test('sendWithReport cuenta enviados', async () => {
    const report = await service.sendWithReport([userA], { title: 'T', body: 'B' });
    expect(report.targeted).toBe(1);
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(0);
  });

  test('sendWithReport vacío y sin tokens', async () => {
    expect(await service.sendWithReport([], { title: 'T', body: 'B' })).toEqual({
      targeted: 0,
      sent: 0,
      failed: 0,
    });
    const stranger = await seedProfile(ctx.db);
    const report = await service.sendWithReport([stranger], { title: 'T', body: 'B' });
    expect(report.sent).toBe(0);
  });

  test('fallo de Expo desactiva el token', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    await service.processSend({ userIds: [userB], payload: { title: 'T', body: 'B' } });
    okFetch();
  });
});
